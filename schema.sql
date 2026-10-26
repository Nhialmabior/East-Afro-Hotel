-- Run in Supabase SQL Editor. Public submissions; only approved staff can read/update.
create table if not exists public.hotel_staff (user_id uuid primary key references auth.users(id) on delete cascade);
create table if not exists public.reservation_requests (
 id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
 guest_name text not null check (char_length(guest_name) between 1 and 120),
 guest_email text not null check (char_length(guest_email) between 3 and 254),
 guest_phone text not null default '' check (char_length(guest_phone)<=40),
 check_in date not null, check_out date not null,
 guests integer not null check (guests between 1 and 30),
 room_preference text not null check (char_length(room_preference)<=100),
 status text not null default 'new' check (status in ('new','contacted','confirmed','declined')) ,
 staff_notes text not null default '', check (check_out>check_in)
);
create table if not exists public.contact_messages (
 id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
 sender_name text not null check (char_length(sender_name) between 1 and 120),
 sender_email text not null check (char_length(sender_email) between 3 and 254),
 sender_phone text not null default '' check (char_length(sender_phone)<=40),
 topic text not null check (char_length(topic)<=100),
 message text not null check (char_length(message) between 1 and 5000),
 status text not null default 'new' check (status in ('new','replied','closed'))
);
create or replace function public.is_hotel_staff() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.hotel_staff where user_id=(select auth.uid()));
$$;
revoke all on function public.is_hotel_staff() from public;
grant execute on function public.is_hotel_staff() to authenticated;
alter table public.hotel_staff enable row level security;
alter table public.reservation_requests enable row level security;
alter table public.contact_messages enable row level security;
revoke all on public.hotel_staff, public.reservation_requests, public.contact_messages from anon, authenticated;
grant insert on public.reservation_requests, public.contact_messages to anon, authenticated;
grant select, update on public.reservation_requests, public.contact_messages to authenticated;
grant select on public.hotel_staff to authenticated;
create policy "staff can see own membership" on public.hotel_staff for select to authenticated using (user_id=(select auth.uid()));
create policy "visitors may request reservations" on public.reservation_requests for insert to anon, authenticated with check (status='new' and staff_notes='');
create policy "visitors may send messages" on public.contact_messages for insert to anon, authenticated with check (status='new');
create policy "staff read reservations" on public.reservation_requests for select to authenticated using (public.is_hotel_staff());
create policy "staff update reservations" on public.reservation_requests for update to authenticated using (public.is_hotel_staff()) with check (public.is_hotel_staff());
create policy "staff read messages" on public.contact_messages for select to authenticated using (public.is_hotel_staff());
create policy "staff update messages" on public.contact_messages for update to authenticated using (public.is_hotel_staff()) with check (public.is_hotel_staff());
-- Create staff users in Supabase Authentication, then add approved user IDs in SQL Editor:
-- insert into public.hotel_staff(user_id) values ('PASTE-STAFF-AUTH-USER-UUID');
-- Public forms need anti-spam protection (e.g. CAPTCHA + rate-limited Edge Function) before broad launch.
