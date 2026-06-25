-- RenovateIQ schema, RLS, triggers, storage.
-- Run this in the Supabase SQL editor (or `supabase db push`).
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        text not null check (role in ('homeowner', 'contractor')),
  full_name   text not null default '',
  city        text,
  phone       text,
  created_at  timestamptz not null default now()
);

create table if not exists public.contractor_profiles (
  id                uuid primary key references public.profiles (id) on delete cascade,
  business_name     text not null default '',
  experience_years  int  not null default 0,
  project_types     text[] not null default '{}',
  rating            numeric(2,1) not null default 0,
  bio               text,
  created_at        timestamptz not null default now()
);

create table if not exists public.portfolio_items (
  id            uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles (id) on delete cascade,
  type          text not null,
  location      text not null,
  year          int  not null,
  cost_display  text not null,
  description   text not null default ''
);

create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  homeowner_id  uuid not null references public.profiles (id) on delete cascade,
  type          text not null,
  city          text not null,
  home_age      text not null,
  area_sqft     int  not null,
  budget_input  bigint not null,
  specific_asks text,
  start_date    date not null,
  status        text not null default 'draft' check (status in ('draft','planned','locked')),
  ai_plan       jsonb,
  locked_at     timestamptz,
  pdf_url       text,
  created_at    timestamptz not null default now()
);

create table if not exists public.leads (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  homeowner_id  uuid not null references public.profiles (id) on delete cascade,
  contractor_id uuid not null references public.profiles (id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending','accepted','declined')),
  sent_at       timestamptz not null default now(),
  unique (project_id, contractor_id)
);

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  sender_id   uuid not null references public.profiles (id) on delete cascade,
  sender_role text not null check (sender_role in ('homeowner','contractor')),
  content     text,
  file_url    text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_projects_homeowner on public.projects (homeowner_id);
create index if not exists idx_leads_contractor on public.leads (contractor_id);
create index if not exists idx_leads_project on public.leads (project_id);
create index if not exists idx_messages_project on public.messages (project_id, created_at);
create index if not exists idx_portfolio_contractor on public.portfolio_items (contractor_id);

-- ---------------------------------------------------------------------------
-- New-user trigger: create profile (+ contractor_profile) from signup metadata
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  r text := coalesce(meta->>'role', 'homeowner');
begin
  insert into public.profiles (id, role, full_name, city, phone)
  values (
    new.id,
    r,
    coalesce(meta->>'full_name', ''),
    nullif(meta->>'city', ''),
    nullif(meta->>'phone', '')
  )
  on conflict (id) do update
    set role = excluded.role,
        full_name = excluded.full_name,
        city = excluded.city,
        phone = excluded.phone;

  if r = 'contractor' then
    insert into public.contractor_profiles
      (id, business_name, experience_years, project_types, rating, bio)
    values (
      new.id,
      coalesce(meta->>'business_name', ''),
      coalesce((meta->>'experience_years')::int, 0),
      coalesce(
        array(select jsonb_array_elements_text(meta->'project_types')),
        '{}'::text[]
      ),
      coalesce((meta->>'rating')::numeric, 0),
      nullif(meta->>'bio', '')
    )
    on conflict (id) do update
      set business_name = excluded.business_name,
          experience_years = excluded.experience_years,
          project_types = excluded.project_types,
          rating = excluded.rating,
          bio = excluded.bio;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Helper: is the current user a participant in a project's conversation?
-- (homeowner who owns it, OR a contractor with a lead on it)
-- ---------------------------------------------------------------------------

create or replace function public.is_project_participant(p_project uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.projects pr
    where pr.id = p_project and pr.homeowner_id = auth.uid()
  )
  or exists (
    select 1 from public.leads l
    where l.project_id = p_project and l.contractor_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles            enable row level security;
alter table public.contractor_profiles enable row level security;
alter table public.portfolio_items     enable row level security;
alter table public.projects            enable row level security;
alter table public.leads               enable row level security;
alter table public.messages            enable row level security;

-- profiles: any signed-in user can read (needed for marketplace + chat names);
-- a user can write only their own row.
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles
  for select to authenticated using (true);
drop policy if exists "profiles upsert own" on public.profiles;
create policy "profiles upsert own" on public.profiles
  for insert to authenticated with check (id = auth.uid());
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update to authenticated using (id = auth.uid());

-- contractor_profiles + portfolio: readable by all signed-in users; owner writes.
drop policy if exists "contractor read" on public.contractor_profiles;
create policy "contractor read" on public.contractor_profiles
  for select to authenticated using (true);
drop policy if exists "contractor write own" on public.contractor_profiles;
create policy "contractor write own" on public.contractor_profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "portfolio read" on public.portfolio_items;
create policy "portfolio read" on public.portfolio_items
  for select to authenticated using (true);
drop policy if exists "portfolio write own" on public.portfolio_items;
create policy "portfolio write own" on public.portfolio_items
  for all to authenticated using (contractor_id = auth.uid()) with check (contractor_id = auth.uid());

-- projects: homeowner owns; a connected contractor can read.
drop policy if exists "projects owner all" on public.projects;
create policy "projects owner all" on public.projects
  for all to authenticated
  using (homeowner_id = auth.uid())
  with check (homeowner_id = auth.uid());
drop policy if exists "projects contractor read" on public.projects;
create policy "projects contractor read" on public.projects
  for select to authenticated
  using (exists (
    select 1 from public.leads l
    where l.project_id = projects.id and l.contractor_id = auth.uid()
  ));

-- leads: homeowner creates/reads own; contractor reads + updates status on theirs.
drop policy if exists "leads homeowner all" on public.leads;
create policy "leads homeowner all" on public.leads
  for all to authenticated
  using (homeowner_id = auth.uid())
  with check (homeowner_id = auth.uid());
drop policy if exists "leads contractor read" on public.leads;
create policy "leads contractor read" on public.leads
  for select to authenticated using (contractor_id = auth.uid());
drop policy if exists "leads contractor update" on public.leads;
create policy "leads contractor update" on public.leads
  for update to authenticated using (contractor_id = auth.uid());

-- messages: only project participants can read/post; sender must be self.
drop policy if exists "messages read participants" on public.messages;
create policy "messages read participants" on public.messages
  for select to authenticated using (public.is_project_participant(project_id));
drop policy if exists "messages insert participants" on public.messages;
create policy "messages insert participants" on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.is_project_participant(project_id));

-- ---------------------------------------------------------------------------
-- Storage: one public bucket for locked-scope PDFs + chat attachments
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', true)
on conflict (id) do nothing;

drop policy if exists "project-files read" on storage.objects;
create policy "project-files read" on storage.objects
  for select using (bucket_id = 'project-files');
drop policy if exists "project-files upload" on storage.objects;
create policy "project-files upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'project-files');

-- ---------------------------------------------------------------------------
-- Realtime: stream new chat messages
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.messages;
