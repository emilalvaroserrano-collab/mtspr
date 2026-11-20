create table if not exists staff_tasks (
  id serial primary key,
  user_id text not null,
  title text not null,
  detail text not null default '',
  status text not null default 'open',
  due_on text not null default '',
  ticket_id integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists staff_tasks_user_idx on staff_tasks (user_id, updated_at desc);
