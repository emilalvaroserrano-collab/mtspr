create table if not exists portal_sessions (
  id serial primary key,
  shop_customer_id integer not null references shop_customers (id) on delete cascade,
  token_hash text not null unique,
  user_agent text not null default '',
  ip text not null default '',
  label text not null default 'Browser',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists portal_sessions_customer_idx on portal_sessions (shop_customer_id, revoked_at, expires_at);
