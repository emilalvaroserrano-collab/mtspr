create table if not exists agent_chats (
  id serial primary key,
  user_id text not null,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_chats_user_idx on agent_chats (user_id, updated_at desc);

create table if not exists agent_messages (
  id serial primary key,
  chat_id integer not null references agent_chats (id) on delete cascade,
  user_id text not null,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists agent_messages_chat_idx on agent_messages (chat_id, id);

create table if not exists agent_memories (
  id serial primary key,
  user_id text not null,
  fact text not null,
  created_at timestamptz not null default now()
);

create index if not exists agent_memories_user_idx on agent_memories (user_id, id desc);
