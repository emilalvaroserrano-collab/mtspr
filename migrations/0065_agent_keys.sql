create table if not exists agent_provider_keys (
  provider text primary key,
  api_key text not null default '',
  model text not null default '',
  updated_at timestamptz not null default now()
);
