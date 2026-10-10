begin;
create table campuspool_private.messages (
 id bigint generated always as identity primary key,
 group_id uuid not null references campuspool_private.groups(id),
 user_id uuid not null references auth.users(id),
 body text not null check(length(body) between 1 and 500),
 nonce uuid not null,
 created_at timestamptz not null default now(),
 unique(user_id,nonce)
);
create index messages_group_page on campuspool_private.messages(group_id,id desc);
create index messages_sender_recent on campuspool_private.messages(user_id,created_at desc);
alter table campuspool_private.messages enable row level security;
revoke all on campuspool_private.messages from public,anon,authenticated;
create function campuspool_private.ride_chat(trip_id uuid,message_text text,client_nonce uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); trip_status text; previous campuspool_private.messages; clean_text text:=btrim(message_text); result jsonb;
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'UNAUTHENTICATED'; end if;
 select status into trip_status from campuspool_private.groups where id=trip_id for share;
 if trip_status is null or not exists(select 1 from campuspool_private.members where group_id=trip_id and user_id=actor and active) then raise exception 'FORBIDDEN'; end if;
 if message_text is not null then
  if clean_text is null or length(clean_text) not between 1 and 500 or client_nonce is null then raise exception 'INVALID_MESSAGE'; end if;
  perform pg_advisory_xact_lock(hashtextextended('chat:'||actor::text,0));
  select * into previous from campuspool_private.messages where user_id=actor and nonce=client_nonce;
  if found then
   if previous.group_id<>trip_id or previous.body<>clean_text then raise exception 'NONCE_REUSED'; end if;
  else
   if trip_status not in ('open','locked','in_progress') then raise exception 'CHAT_CLOSED'; end if;
   if (select count(*) from campuspool_private.messages where user_id=actor and created_at>now()-interval '10 seconds')>=5 then raise exception 'RATE_LIMITED'; end if;
   insert into campuspool_private.messages(group_id,user_id,body,nonce) values(trip_id,actor,clean_text,client_nonce);
  end if;
 end if;
 select coalesce(jsonb_agg(item order by msg_id),'[]'::jsonb) into result from (
  select m.id msg_id,jsonb_build_object('id',m.id::text,'userId',m.user_id,'name',p.display_name,'body',m.body,'createdAt',m.created_at) item
  from campuspool_private.messages m join campuspool_private.profiles p on p.id=m.user_id where m.group_id=trip_id order by m.id desc limit 50
 ) recent;
 return result;
end $$;
revoke all on function campuspool_private.ride_chat(uuid,text,uuid) from public,anon;
grant execute on function campuspool_private.ride_chat(uuid,text,uuid) to authenticated;
create function public.campuspool_chat(trip_id uuid,message_text text default null,client_nonce uuid default null) returns jsonb
language sql security invoker set search_path='' as $$ select campuspool_private.ride_chat(trip_id,message_text,client_nonce) $$;
revoke all on function public.campuspool_chat(uuid,text,uuid) from public,anon;
grant execute on function public.campuspool_chat(uuid,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
