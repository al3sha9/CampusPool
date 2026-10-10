begin;
alter table campuspool_private.requests alter column car_estimate_pkr drop not null;
alter table campuspool_private.hubs alter column estimate_pkr drop not null;
create or replace function campuspool_private.dispatch(action text, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare
 actor uuid := auth.uid(); gid uuid; rid uuid; op uuid; req_hash bytea; saved campuspool_private.operations;
 g campuspool_private.groups; r campuspool_private.requests;
 result jsonb; n integer; idx integer; fare integer; attempts integer; who uuid; version_expected integer;
 destination_id text; destination_name text; destination_address text; destination_source text; dest_lon double precision; dest_lat double precision; car_estimate integer;
 earliest timestamptz; latest timestamptz; budget integer; token text; expiry timestamptz; name text;
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'UNAUTHENTICATED'; end if;
 -- The name is display-only; affiliation is always server-managed, never user_metadata.
 select coalesce(nullif(left(btrim(raw_user_meta_data->>'display_name'),60),''),'Demo student') into name from auth.users where id=actor;
 insert into campuspool_private.profiles(id,display_name) values(actor,name) on conflict(id) do nothing;
 if action in ('bootstrap','search') then perform campuspool_private.expire_open(); end if;
 if action='bootstrap' then
  select m.group_id into gid from campuspool_private.members m join campuspool_private.groups gg on gg.id=m.group_id where m.user_id=actor and m.active and m.dismissed_at is null order by m.current_trip desc,gg.created_at desc limit 1;
  return jsonb_build_object('profile',(select jsonb_build_object('id',id,'name',display_name,'affiliation',affiliation_status) from campuspool_private.profiles where id=actor),
    'group',case when gid is null then null else campuspool_private.group_json(gid,actor) end);
 end if;
 if action='read' then
  gid := (payload->>'groupId')::uuid;
  if not exists(select 1 from campuspool_private.members where group_id=gid and user_id=actor and active) then raise exception 'FORBIDDEN'; end if;
  return campuspool_private.group_json(gid,actor);
 end if;
 if action not in ('search','join','confirm','lock','quote','own_arrival','start','complete','cancel','leave','dismiss','issue_qr','verify_qr') then raise exception 'INVALID_ACTION'; end if;
 op := (payload->>'operationId')::uuid;
 if op is null then raise exception 'OPERATION_ID_REQUIRED'; end if;
 -- Serialize retries for the same caller/operation without locking other users.
 perform pg_advisory_xact_lock(hashtextextended(actor::text||op::text,0));
 req_hash := extensions.digest((payload-'operationId')::text,'sha256');
 select * into saved from campuspool_private.operations where user_id=actor and operation_id=op;
 if found then
  if saved.action<>action or saved.request_hash<>req_hash then raise exception 'OPERATION_REUSED'; end if;
  if action='issue_qr' then return jsonb_build_object('error','QR_ALREADY_ISSUED'); end if;
  -- Replay canonical current group, not an obsolete snapshot after another mutation.
  if saved.response ? 'id' and exists(select 1 from campuspool_private.members where group_id=(saved.response->>'id')::uuid and user_id=actor and active) then
   return campuspool_private.group_json((saved.response->>'id')::uuid,actor);
  end if;
  return saved.response;
 end if;
 if action='search' then
  perform pg_advisory_xact_lock(hashtextextended('request:'||actor::text,0));
  earliest:=(payload->'request'->>'earliestAt')::timestamptz; latest:=(payload->'request'->>'latestAt')::timestamptz;
  budget:=(payload->'request'->>'maxShare')::integer;
  if earliest is null or latest is null or earliest<=now() or latest>now()+interval '24 hours' or latest-earliest not between interval '5 minutes' and interval '60 minutes' then raise exception 'INVALID_WINDOW'; end if;
  if budget is null or budget not between 1 and 1000000 then raise exception 'INVALID_BUDGET'; end if;
  if exists(select 1 from campuspool_private.requests where user_id=actor and status in ('grouped','locked','in_progress')) then raise exception 'ACTIVE_REQUEST_EXISTS'; end if;
  if (select count(*) from campuspool_private.operations where user_id=actor and action='search' and created_at>now()-interval '1 minute')>=20 then raise exception 'RATE_LIMITED'; end if;
  destination_id:=payload->'request'->>'hubId';
  if payload->'request' ? 'destination' then
   destination_id:=payload->'request'->'destination'->>'id';
   destination_name:=btrim(payload->'request'->'destination'->>'name');
   destination_address:=coalesce(payload->'request'->'destination'->>'address','');
   destination_source:=payload->'request'->'destination'->>'source';
   dest_lon:=(payload->'request'->'destination'->>'longitude')::double precision;
   dest_lat:=(payload->'request'->'destination'->>'latitude')::double precision;
   if dest_lon is null or dest_lat is null or dest_lon not between 72.5 and 74 or dest_lat not between 33 and 34.5 or
    destination_name is null or length(destination_name) not between 1 and 160 or length(destination_address)>300 or destination_source not in ('osm','pin','preset') or destination_source is null then raise exception 'INVALID_DESTINATION'; end if;
   if destination_source='pin' then
    dest_lat:=round(dest_lat::numeric,4); dest_lon:=round(dest_lon::numeric,4);
    destination_id:='pin:'||to_char(dest_lat,'FM990.0000')||':'||to_char(dest_lon,'FM990.0000');
   elsif destination_source='osm' then
    if destination_id is null or destination_id !~ '^osm:[NWR]:[1-9][0-9]{0,18}$' then raise exception 'INVALID_DESTINATION'; end if;
   elsif destination_id not in ('metro','city') or destination_id is null then raise exception 'INVALID_DESTINATION'; end if;
   car_estimate:=(payload->'request'->>'carEstimate')::integer;
   if car_estimate is not null and car_estimate not between 1 and 1000000 then raise exception 'INVALID_FARE'; end if;
   insert into campuspool_private.hubs(id,name,estimate_pkr,address,longitude,latitude,source)
    values(destination_id,destination_name,car_estimate,destination_address,dest_lon,dest_lat,case when destination_source='preset' then 'legacy' else destination_source end)
    on conflict(id) do nothing;
   -- First accepted location is canonical. Later callers cannot move a group's destination.
   if exists(select 1 from campuspool_private.hubs h where h.id=destination_id and (h.longitude is null or abs(h.longitude-dest_lon)>0.0005 or abs(h.latitude-dest_lat)>0.0005)) then raise exception 'DESTINATION_CONFLICT'; end if;
  else
   select estimate_pkr into car_estimate from campuspool_private.hubs where id=destination_id;
   if car_estimate is null then raise exception 'INVALID_DESTINATION'; end if;
  end if;
  payload:=jsonb_set(payload,'{request,hubId}',to_jsonb(destination_id));
  if exists(select 1 from campuspool_private.requests where user_id=actor and status in ('grouped','locked','in_progress')) then raise exception 'ACTIVE_REQUEST_EXISTS'; end if;
  update campuspool_private.requests set status='cancelled' where user_id=actor and status='searching';
  insert into campuspool_private.requests(user_id,hub_id,earliest_at,latest_at,max_share,car_estimate_pkr)
   values(actor,destination_id,earliest,latest,budget,car_estimate) returning id into rid;
  select coalesce(jsonb_agg(item order by departure), '[]'::jsonb) into result from (
   select jsonb_build_object('id',gg.id,'count',mm.n,'total',gg.total,'departureAt',greatest(gg.earliest_at,earliest)) item,greatest(gg.earliest_at,earliest) departure
   from campuspool_private.groups gg cross join lateral (select count(*) n from campuspool_private.members where group_id=gg.id and active) mm
   where gg.status='open' and gg.hub_id=payload->'request'->>'hubId' and mm.n between 1 and 2
    and greatest(gg.earliest_at,earliest)<=least(gg.latest_at,latest)
    and gg.total/(mm.n+1)<=budget
    and not exists(select 1 from (select request_id,row_number() over(order by position)-1 idx from campuspool_private.members where group_id=gg.id and active) ranked join campuspool_private.requests rr on rr.id=ranked.request_id where gg.total/(mm.n+1)+case when ranked.idx<gg.total%(mm.n+1) then 1 else 0 end>rr.max_share)
  ) suggestions;
  result:=jsonb_build_object('requestId',rid,'suggestions',result);
 elsif action='join' then
  gid:=nullif(payload->>'groupId','')::uuid;
  if gid is not null then
   select * into g from campuspool_private.groups where id=gid for update;
   if not found or g.status<>'open' then raise exception 'INVALID_TRANSITION'; end if;
  end if;
  -- Acquire joining + existing requests in deterministic order after the group.
  perform 1 from campuspool_private.requests rr where rr.id=(payload->>'requestId')::uuid or rr.id in(select request_id from campuspool_private.members where group_id=gid and active) order by rr.id for update;
  select * into r from campuspool_private.requests where id=(payload->>'requestId')::uuid and user_id=actor and status='searching';
  if not found then raise exception 'ACTIVE_REQUEST_EXISTS'; end if;
  if r.latest_at<now() then raise exception 'WINDOW_EXPIRED'; end if;
  if exists(select 1 from campuspool_private.members where user_id=actor and current_trip) then raise exception 'ACTIVE_REQUEST_EXISTS'; end if;
  if gid is null then
   fare:=coalesce((payload->>'carEstimate')::integer,r.car_estimate_pkr);
   if fare is null or fare not between 1 and 1000000 then raise exception 'INVALID_FARE'; end if;
   insert into campuspool_private.groups(hub_id,organiser_id,total,initial_total,earliest_at,latest_at) values(r.hub_id,actor,fare,fare,r.earliest_at,r.latest_at) returning id into gid;
   insert into campuspool_private.quotes(group_id,total,source,entered_by) values(gid,fare,'initial_estimate',actor);
  else
   select count(*) into n from campuspool_private.members where group_id=gid and active;
   if n>=3 then raise exception 'GROUP_FULL'; end if;
   if g.latest_at<now() then raise exception 'WINDOW_EXPIRED'; end if;
   if g.hub_id<>r.hub_id or greatest(g.earliest_at,r.earliest_at)>least(g.latest_at,r.latest_at) then raise exception 'INCOMPATIBLE_GROUP'; end if;
   if exists(select 1 from (
    select max_share,row_number() over(order by position)-1 idx from (
     select rr.max_share,m.position from campuspool_private.members m join campuspool_private.requests rr on rr.id=m.request_id where m.group_id=gid and m.active
     union all select r.max_share,coalesce((select position from campuspool_private.members where group_id=gid and user_id=actor),9223372036854775807::bigint)
    ) prospective
   ) ranked where g.total/(n+1)+case when ranked.idx<g.total%(n+1) then 1 else 0 end>ranked.max_share) then raise exception 'BUDGET_EXCEEDED'; end if;
   update campuspool_private.groups set version=version+1,earliest_at=greatest(earliest_at,r.earliest_at),latest_at=least(latest_at,r.latest_at) where id=gid;
   perform campuspool_private.invalidate(gid);
  end if;
  -- Returning members keep an immutable join position so the exact split is stable.
  insert into campuspool_private.members(group_id,user_id,request_id) values(gid,actor,r.id)
   on conflict(group_id,user_id) do update set request_id=excluded.request_id,active=true,current_trip=true,confirmed_version=null,pickup_confirmed_at=null,dismissed_at=null;
  update campuspool_private.requests set status='grouped' where id=r.id;
  result:=campuspool_private.group_json(gid,actor);
 else
  gid:=(payload->>'groupId')::uuid;
  select * into g from campuspool_private.groups where id=gid for update;
  if not found or not exists(select 1 from campuspool_private.members where group_id=gid and user_id=actor and active) then raise exception 'FORBIDDEN'; end if;
  perform 1 from campuspool_private.requests rr join campuspool_private.members m on m.request_id=rr.id where m.group_id=gid order by rr.id for update of rr;
  version_expected:=(payload->>'version')::integer;
  if version_expected is null or version_expected<>g.version then raise exception 'VERSION_CONFLICT'; end if;
  if g.status in ('completed','cancelled') and action<>'dismiss' then raise exception 'INVALID_TRANSITION'; end if;
  if action in ('lock','quote','own_arrival','start','complete','cancel','verify_qr') and g.organiser_id<>actor then raise exception 'FORBIDDEN'; end if;
  if action in ('confirm','lock','quote','own_arrival','start','issue_qr','verify_qr') and g.latest_at<now() then raise exception 'WINDOW_EXPIRED'; end if;
  select count(*) into n from campuspool_private.members where group_id=gid and active;
  if action='confirm' then
   if g.status not in ('open','locked') or n<2 then raise exception 'INVALID_TRANSITION'; end if;
   select ranked.idx,rr.max_share into idx,budget from (select user_id,row_number() over(order by position)-1 idx,request_id from campuspool_private.members where group_id=gid and active) ranked join campuspool_private.requests rr on rr.id=ranked.request_id where ranked.user_id=actor;
   if (g.total/n+case when idx<g.total%n then 1 else 0 end)>budget then raise exception 'BUDGET_EXCEEDED'; end if;
   update campuspool_private.members set confirmed_version=g.version where group_id=gid and user_id=actor;
  elsif action='lock' then
   if g.status<>'open' or not campuspool_private.all_consented(gid) then raise exception 'CONSENT_REQUIRED'; end if;
   update campuspool_private.groups set status='locked' where id=gid;
   update campuspool_private.requests rr set status='locked' from campuspool_private.members m where m.group_id=gid and m.active and m.request_id=rr.id;
  elsif action='quote' then
   if g.status<>'locked' then raise exception 'INVALID_TRANSITION'; end if;
   fare:=(payload->>'total')::integer; if fare is null or fare not between 1 and 1000000 then raise exception 'INVALID_FARE'; end if;
   insert into campuspool_private.quotes(group_id,total,source,entered_by) values(gid,fare,'organiser_quote',actor);
   if fare<>g.total then
    update campuspool_private.groups set total=fare,version=version+1 where id=gid; perform campuspool_private.invalidate(gid);
   end if;
  elsif action='own_arrival' then
   if g.status<>'locked' or not campuspool_private.all_consented(gid) then raise exception 'CONSENT_REQUIRED'; end if;
   update campuspool_private.members set pickup_confirmed_at=coalesce(pickup_confirmed_at,now()) where group_id=gid and user_id=actor;
  elsif action='start' then
   if g.status<>'locked' or not campuspool_private.all_consented(gid) or exists(select 1 from campuspool_private.members where group_id=gid and active and pickup_confirmed_at is null) then raise exception 'PICKUP_REQUIRED'; end if;
   update campuspool_private.groups set status='in_progress',started_at=now() where id=gid;
   update campuspool_private.requests rr set status='in_progress' from campuspool_private.members m where m.group_id=gid and m.active and m.request_id=rr.id;
  elsif action='complete' then
   if g.status<>'in_progress' then raise exception 'INVALID_TRANSITION'; end if;
   if payload ? 'total' then
    fare:=(payload->>'total')::integer; if fare is null or fare not between 1 and 1000000 then raise exception 'INVALID_FARE'; end if;
    insert into campuspool_private.quotes(group_id,total,source,entered_by) values(gid,fare,'final_total',actor);
   else fare:=g.total; end if;
   update campuspool_private.groups set status='completed',total=fare,completed_at=now() where id=gid;
   perform campuspool_private.terminal(gid,'completed');
  elsif action='cancel' then
   if g.status not in ('open','locked','in_progress') or length(btrim(coalesce(payload->>'reason',''))) not between 1 and 200 then raise exception 'INVALID_TRANSITION'; end if;
   update campuspool_private.groups set status='cancelled',version=version+1,cancellation_reason=btrim(payload->>'reason') where id=gid;
   perform campuspool_private.invalidate(gid); perform campuspool_private.terminal(gid,'cancelled');
  elsif action='leave' then
   if g.status not in ('open','locked') then raise exception 'INVALID_TRANSITION'; end if;
   update campuspool_private.members set active=false,current_trip=false,confirmed_version=null,pickup_confirmed_at=null,dismissed_at=now() where group_id=gid and user_id=actor;
   update campuspool_private.requests rr set status='cancelled' from campuspool_private.members m where m.group_id=gid and m.user_id=actor and m.request_id=rr.id;
   n:=n-1;
   update campuspool_private.groups set version=version+1,
    organiser_id=case when organiser_id=actor and n>0 then (select user_id from campuspool_private.members where group_id=gid and active order by position limit 1) else organiser_id end where id=gid;
   perform campuspool_private.invalidate(gid);
   if n=0 or (g.status='locked' and n<2) then
    update campuspool_private.groups set status='cancelled',cancellation_reason='Not enough passengers to continue.' where id=gid;
    perform campuspool_private.terminal(gid,'cancelled');
   elsif g.status='open' then
    update campuspool_private.groups set earliest_at=(select max(rr.earliest_at) from campuspool_private.requests rr join campuspool_private.members m on m.request_id=rr.id where m.group_id=gid and m.active),latest_at=(select min(rr.latest_at) from campuspool_private.requests rr join campuspool_private.members m on m.request_id=rr.id where m.group_id=gid and m.active) where id=gid;
   end if;
  elsif action='dismiss' then
   if g.status not in ('completed','cancelled') then raise exception 'INVALID_TRANSITION'; end if;
   update campuspool_private.members set dismissed_at=now() where group_id=gid and user_id=actor;
  elsif action in ('issue_qr','verify_qr') then
   if g.status<>'locked' or not campuspool_private.all_consented(gid) then raise exception 'CONSENT_REQUIRED'; end if;
   insert into campuspool_private.rate_limits(group_id,user_id,action,minute,attempts) values(gid,actor,action,date_trunc('minute',now()),1)
    on conflict(group_id,user_id,action,minute) do update set attempts=campuspool_private.rate_limits.attempts+1 returning campuspool_private.rate_limits.attempts into attempts;
   if attempts>10 then return jsonb_build_object('error','RATE_LIMITED'); end if;
   if action='issue_qr' then
    if g.organiser_id=actor or exists(select 1 from campuspool_private.members where group_id=gid and user_id=actor and pickup_confirmed_at is not null) then raise exception 'INVALID_TRANSITION'; end if;
    token:=encode(extensions.gen_random_bytes(16),'hex'); expiry:=now()+interval '5 minutes';
    insert into campuspool_private.pickup_secrets(group_id,user_id,group_version,token_hash,expires_at) values(gid,actor,g.version,extensions.digest(token,'sha256'),expiry)
     on conflict(group_id,user_id) do update set group_version=excluded.group_version,token_hash=excluded.token_hash,expires_at=excluded.expires_at,consumed_at=null,verified_by=null;
    result:=jsonb_build_object('value','campuspool:pickup:v1:'||token,'expiresAt',extract(epoch from expiry)*1000);
   else
    token:=payload->>'token';
    if token is null or token !~ '^[a-f0-9]{32}$' then return jsonb_build_object('error','INVALID_QR'); end if;
    select user_id into who from campuspool_private.pickup_secrets where group_id=gid and group_version=g.version and token_hash=extensions.digest(token,'sha256') and expires_at>now() and consumed_at is null for update;
    if who is null or who=actor or not exists(select 1 from campuspool_private.members where group_id=gid and user_id=who and active) then return jsonb_build_object('error','INVALID_QR'); end if;
    update campuspool_private.pickup_secrets set consumed_at=now(),verified_by=actor where group_id=gid and user_id=who;
    update campuspool_private.members set pickup_confirmed_at=now() where group_id=gid and user_id=who;
   end if;
  end if;
  if action<>'issue_qr' then result:=campuspool_private.group_json(gid,actor); end if;
 end if;
 if gid is not null then insert into campuspool_private.events(group_id,actor_id,action) values(gid,actor,action); end if;
 insert into campuspool_private.operations(user_id,operation_id,action,request_hash,response) values(actor,op,action,req_hash,
  case when action='issue_qr' then jsonb_build_object('issued',true,'expiresAt',result->'expiresAt')
       else result end);
 return result;
end $$;


notify pgrst, 'reload schema';
commit;
