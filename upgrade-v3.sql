-- Run AFTER schema.sql. Staff-only room inventory and dated blocks.
create table if not exists public.room_inventory (
 id uuid primary key default gen_random_uuid(),
 room_code text not null unique check(length(room_code) between 1 and 30),
 room_type text not null check(length(room_type) between 1 and 100),
 nightly_rate_usd numeric(10,2) check(nightly_rate_usd >= 0),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.room_blocks (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.room_inventory(id) on delete cascade,
 check_in date not null,
 check_out date not null,
 block_type text not null check(block_type in ('booking','maintenance','hold')),
 guest_reference text not null default '' check(length(guest_reference)<=120),
 notes text not null default '' check(length(notes)<=1000),
 created_at timestamptz not null default now(),
 check(check_out>check_in)
);
create index if not exists room_blocks_dates_idx on public.room_blocks(room_id,check_in,check_out);
create or replace function public.prevent_room_overlap() returns trigger language plpgsql set search_path = '' as $$
begin
 if exists (select 1 from public.room_blocks b where b.room_id=new.room_id and b.id<>new.id and b.check_in<new.check_out and b.check_out>new.check_in) then
  raise exception 'Room is already blocked for overlapping dates';
 end if;
 return new;
end $$;
drop trigger if exists room_overlap_guard on public.room_blocks;
create trigger room_overlap_guard before insert or update on public.room_blocks for each row execute function public.prevent_room_overlap();
-- Serialize modifications per room to prevent simultaneous inserts from bypassing the overlap check.
create or replace function public.lock_room_for_block() returns trigger language plpgsql set search_path = '' as $$
begin
 perform 1 from public.room_inventory where id=new.room_id for update;
 return new;
end $$;
drop trigger if exists room_lock_guard on public.room_blocks;
create trigger room_lock_guard before insert or update on public.room_blocks for each row execute function public.lock_room_for_block();
alter table public.room_inventory enable row level security;
alter table public.room_blocks enable row level security;
revoke all on public.room_inventory,public.room_blocks from anon,authenticated;
grant select,insert,update,delete on public.room_inventory,public.room_blocks to authenticated;
create policy "staff manage inventory" on public.room_inventory for all to authenticated using (public.is_hotel_staff()) with check (public.is_hotel_staff());
create policy "staff manage blocks" on public.room_blocks for all to authenticated using (public.is_hotel_staff()) with check (public.is_hotel_staff());
-- These records are private to approved staff; do not expose via public website.
