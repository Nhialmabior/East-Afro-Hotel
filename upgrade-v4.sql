-- Run AFTER schema.sql and upgrade-v3.sql.
-- Transactional reservation confirmation and cancellation, linked to inventory.
alter table public.room_blocks add column if not exists reservation_request_id uuid unique references public.reservation_requests(id) on delete restrict;
create index if not exists room_blocks_request_idx on public.room_blocks(reservation_request_id);
-- Only the staff-only RPC below may set status to confirmed.
drop policy if exists "staff update reservations" on public.reservation_requests;
create policy "staff update nonconfirmed reservations" on public.reservation_requests for update to authenticated
 using (public.is_hotel_staff() and status <> 'confirmed') with check (public.is_hotel_staff() and status <> 'confirmed');
-- Prevent ad hoc deletion or reassignment of blocks linked to reservations.
create or replace function public.protect_linked_room_blocks() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op = 'DELETE' and old.reservation_request_id is not null then
  raise exception 'Cancel the linked reservation using the dashboard';
 end if;
 if tg_op = 'UPDATE' and old.reservation_request_id is not null then
  raise exception 'Cancel and reconfirm the linked reservation to change its room';
 end if;
 return coalesce(new,old);
end $$;
drop trigger if exists protect_linked_blocks on public.room_blocks;
create trigger protect_linked_blocks before update or delete on public.room_blocks for each row execute function public.protect_linked_room_blocks();
create or replace function public.confirm_hotel_reservation(p_request_id uuid, p_room_id uuid, p_reference text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare req public.reservation_requests%rowtype; block_id uuid;
begin
 if not public.is_hotel_staff() then raise exception 'Not authorized'; end if;
 select * into req from public.reservation_requests where id=p_request_id for update;
 if not found then raise exception 'Reservation request not found'; end if;
 if req.status='declined' then raise exception 'Declined requests cannot be confirmed'; end if;
 if exists(select 1 from public.room_blocks where reservation_request_id=p_request_id) then raise exception 'Request already has a room allocation'; end if;
 if not exists(select 1 from public.room_inventory where id=p_room_id and active=true) then raise exception 'Room is not active'; end if;
 insert into public.room_blocks(room_id,check_in,check_out,block_type,guest_reference,reservation_request_id)
 values(p_room_id,req.check_in,req.check_out,'booking',left(coalesce(p_reference,''),120),p_request_id) returning id into block_id;
 update public.reservation_requests set status='confirmed' where id=p_request_id;
 return block_id;
end $$;
revoke all on function public.confirm_hotel_reservation(uuid,uuid,text) from public,anon;
grant execute on function public.confirm_hotel_reservation(uuid,uuid,text) to authenticated;
-- A security definer function still invokes triggers; allow only this function to remove linked blocks.
create or replace function public.protect_linked_room_blocks() returns trigger language plpgsql set search_path='' as $$
begin
 if old.reservation_request_id is not null and current_setting('hotel.allow_linked_delete',true) <> 'yes' then
  raise exception 'Use the reservation cancellation workflow for linked blocks';
 end if;
 return coalesce(new,old);
end $$;
create or replace function public.cancel_hotel_reservation(p_request_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare req public.reservation_requests%rowtype;
begin
 if not public.is_hotel_staff() then raise exception 'Not authorized'; end if;
 select * into req from public.reservation_requests where id=p_request_id for update;
 if not found then raise exception 'Reservation request not found'; end if;
 perform set_config('hotel.allow_linked_delete','yes',true);
 delete from public.room_blocks where reservation_request_id=p_request_id;
 update public.reservation_requests set status='contacted' where id=p_request_id;
 perform set_config('hotel.allow_linked_delete','',true);
end $$;
revoke all on function public.cancel_hotel_reservation(uuid) from public,anon;
grant execute on function public.cancel_hotel_reservation(uuid) to authenticated;
-- IMPORTANT: These staff functions use RLS-privileged ownership. Keep EXECUTE restricted.
