create extension if not exists "pgcrypto";

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  age numeric,
  gender text,
  address text,
  chronic text,
  condition text,
  labs text,
  notes text,
  photo text,
  created_at timestamptz not null default now(),
  last_visit timestamptz
);

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  visit_date date not null default current_date,
  vitals text,
  diagnosis text,
  prescription text,
  notes text,
  photo text,
  created_at timestamptz not null default now()
);

alter table public.patients enable row level security;
alter table public.visits enable row level security;

drop policy if exists "allow all patients" on public.patients;
create policy "allow all patients" on public.patients for all using (true) with check (true);

drop policy if exists "allow all visits" on public.visits;
create policy "allow all visits" on public.visits for all using (true) with check (true);

create index if not exists idx_visits_patient on public.visits(patient_id);

-- إضافة عمود التحاليل المجرأة لقواعد البيانات الموجودة مسبقاً
alter table public.patients add column if not exists labs text;
