create table runs (
  id           uuid primary key default gen_random_uuid(),
  device_id    text   not null,
  name         text   not null check (length(name) between 1 and 12),
  score        int    not null check (score between 0 and 1000000),
  outcome      text   not null check (outcome in ('victory','defeat')),
  level        int    not null check (level between 1 and 3),
  hero         text   not null,
  pacts        text[] not null default '{}',
  pact_xp      int    not null check (pact_xp >= 0),
  pact_count   int    generated always as (cardinality(pacts)) stored,
  kills        int    not null check (kills >= 0),
  lives_left   int    not null check (lives_left >= 0),
  multiplier   numeric(4,2) not null,
  raw_score    int    not null,
  life_bonus   int    not null,
  client_version text,
  created_at   timestamptz not null default now()
);
create index runs_score_idx        on runs (score desc, created_at desc);
create index runs_level_score_idx  on runs (level, score desc);
create index runs_hero_score_idx   on runs (hero, score desc);
create index runs_pacts_score_idx  on runs (pact_count, score desc);
create index runs_device_recent    on runs (device_id, created_at desc);

alter table runs enable row level security;
create policy "public read" on runs for select to anon using (true);
-- no insert/update/delete policies for anon → blocked. Only the Edge Function
-- (service role) writes.
