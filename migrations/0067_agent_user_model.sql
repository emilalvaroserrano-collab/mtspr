create table if not exists agent_user_models (
  user_id text primary key,
  provider text not null,
  model text not null,
  updated_at timestamptz not null default now()
);
