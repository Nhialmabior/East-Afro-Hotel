-- =========================================================
-- EAST AFRO HOTEL - UPGRADE V6: BILLING & GUEST STAYS
-- Run after schema.sql, upgrade-v3.sql, upgrade-v4.sql, upgrade-v5.sql
-- =========================================================

-- 1. Guest stays (Check-in / Check-out tracking)
create table if not exists public.hotel_stays (
  id uuid primary key default gen_random_uuid(),
  reservation_request_id uuid not null unique references public.reservation_requests(id) on delete cascade,
  currency text not null default 'USD' check (currency in ('USD', 'SSP')),
  nightly_rate numeric(12, 2) not null check (nightly_rate >= 0),
  status text not null default 'in_house' check (status in ('in_house', 'checked_out')),
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz,
  created_at timestamptz not null default now()
);

-- 2. Incidental charges (meals, laundry, discounts, etc.)
create table if not exists public.hotel_charges (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null references public.hotel_stays(id) on delete cascade,
  category text not null check (category in ('meals', 'laundry', 'other', 'discount', 'accommodation')),
  description text not null default '',
  quantity numeric(8, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  amount numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

-- 3. Payments received (Cash, Bank Transfer, POS)
create table if not exists public.hotel_payments (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null references public.hotel_stays(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  payment_currency text not null check (payment_currency in ('USD', 'SSP')),
  exchange_rate_to_stay_currency numeric(12, 4) not null default 1,
  converted_amount numeric(12, 2) not null,
  payment_method text not null check (payment_method in ('cash', 'bank_transfer', 'pos', 'mobile_money', 'other')),
  reference text not null default '',
  notes text not null default '',
  paid_at timestamptz not null default now()
);

-- 4. Financial calculation view
create or replace view public.hotel_stay_financials as
select
  s.id as stay_id,
  s.reservation_request_id,
  s.currency,
  s.status,
  coalesce(sum(distinct c.amount), 0)::numeric(12,2) as total_charges,
  coalesce(sum(distinct p.converted_amount), 0)::numeric(12,2) as total_paid,
  (coalesce(sum(distinct c.amount), 0) - coalesce(sum(distinct p.converted_amount), 0))::numeric(12,2) as balance
from public.hotel_stays s
left join public.hotel_charges c on c.stay_id = s.id
left join public.hotel_payments p on p.stay_id = s.id
group by s.id, s.reservation_request_id, s.currency, s.status;

-- 5. RPC function: Start guest stay (Check-In)
create or replace function public.start_hotel_stay(
  p_request_id uuid,
  p_currency text,
  p_nightly_rate numeric
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_stay_id uuid;
begin
  if not public.is_hotel_staff() then raise exception 'Not authorized'; end if;
  
  insert into public.hotel_stays (reservation_request_id, currency, nightly_rate, status)
  values (p_request_id, p_currency, p_nightly_rate, 'in_house')
  returning id into v_stay_id;
  
  -- Add initial room charge based on stay nights
  insert into public.hotel_charges (stay_id, category, description, quantity, unit_price, amount)
  select 
    v_stay_id, 
    'accommodation', 
    'Room stay (' || (r.check_out - r.check_in) || ' nights)',
    (r.check_out - r.check_in),
    p_nightly_rate,
    (r.check_out - r.check_in) * p_nightly_rate
  from public.reservation_requests r
  where r.id = p_request_id;

  return v_stay_id;
end $$;

-- 6. RPC function: Finish stay (Check-Out)
create or replace function public.finish_hotel_stay(p_stay_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_hotel_staff() then raise exception 'Not authorized'; end if;
  
  update public.hotel_stays
  set status = 'checked_out', checked_out_at = now()
  where id = p_stay_id;
end $$;

-- 7. Permissions and Row Level Security
alter table public.hotel_stays enable row level security;
alter table public.hotel_charges enable row level security;
alter table public.hotel_payments enable row level security;

grant select, insert, update on public.hotel_stays, public.hotel_charges, public.hotel_payments to authenticated;
grant select on public.hotel_stay_financials to authenticated;
grant execute on function public.start_hotel_stay, public.finish_hotel_stay to authenticated;

create policy "staff manage stays" on public.hotel_stays for all to authenticated using (public.is_hotel_staff()) with check (public.is_hotel_staff());
create policy "staff manage charges" on public.hotel_charges for all to authenticated using (public.is_hotel_staff()) with check (public.is_hotel_staff());
create policy "staff manage payments" on public.hotel_payments for all to authenticated using (public.is_hotel_staff()) with check (public.is_hotel_staff());
