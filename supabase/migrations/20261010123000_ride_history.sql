begin;
create function campuspool_private.ride_history() returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); result jsonb;
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'UNAUTHENTICATED'; end if;
 select coalesce(jsonb_agg(item order by trip_date desc),'[]'::jsonb) into result from (
  select coalesce(g.completed_at,g.started_at,g.created_at) trip_date,
   jsonb_build_object('id',g.id,'destination',h.name,'status',g.status,'date',coalesce(g.completed_at,g.started_at,g.created_at),'total',g.total,'initialTotal',g.initial_total,
    'share',case when g.status='completed' then (select g.total/ranked.n+case when ranked.idx<g.total%ranked.n then 1 else 0 end from
     (select user_id,row_number() over(order by position)-1 idx,count(*) over() n from campuspool_private.members where group_id=g.id and active) ranked where ranked.user_id=actor) else null end,
    'passengers',(select count(*) from campuspool_private.members where group_id=g.id and active)) item
  from campuspool_private.groups g join campuspool_private.hubs h on h.id=g.hub_id
  where g.status in ('completed','cancelled') and exists(select 1 from campuspool_private.members where group_id=g.id and user_id=actor)
  order by coalesce(g.completed_at,g.started_at,g.created_at) desc limit 30
 ) trips;
 return result;
end $$;
revoke all on function campuspool_private.ride_history() from public,anon;
grant execute on function campuspool_private.ride_history() to authenticated;
create function public.campuspool_history() returns jsonb language sql security invoker set search_path='' as $$ select campuspool_private.ride_history() $$;
revoke all on function public.campuspool_history() from public,anon;
grant execute on function public.campuspool_history() to authenticated;
notify pgrst,'reload schema';
commit;
