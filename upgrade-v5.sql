-- Run after schema.sql, upgrade-v3.sql, upgrade-v4.sql.
-- Public read-only, aggregate availability. No room IDs, guest details, or block records exposed.
-- SECURITY: The owner of this SECURITY DEFINER function must be a trusted database role.
create or replace function public.public_room_availability(
 p_check_in date, p_check_out date, p_room_type text default null
) returns table(room_type text, total_rooms bigint, available_rooms bigint, nightly_rate_from_usd numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
 if p_check_in is null or p_check_out is null or p_check_out <= p_check_in
    or p_check_in < current_date or p_check_out > current_date + 366 then
   raise exception 'Invalid date range';
 end if;
 return query
 select r.room_type, count(*)::bigint,
 count(*) filter(where not exists (
  select 1 from public.room_blocks b where b.room_id=r.id
  and b.check_in < p_check_out and b.check_out > p_check_in
 ))::bigint, min(r.nightly_rate_usd)
 from public.room_inventory r
 where r.active = true and (p_room_type is null or r.room_type = p_room_type)
 group by r.room_type order by r.room_type;
end $$;
revoke all on function public.public_room_availability(date,date,text) from public;
grant execute on function public.public_room_availability(date,date,text) to anon,authenticated;
-- Operational note: public form INSERTs are still direct. Honeypots are not
-- sufficient protection against automated abuse. Add a CAPTCHA-verified,
-- rate-limited server-side endpoint before launching publicly.
