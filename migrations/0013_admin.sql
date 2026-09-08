alter table users add column disabled_at integer;
alter table users add column session_epoch integer not null default 0;

create table password_resets (
  code_hash text primary key,
  user_id text not null references users(id) on delete cascade,
  created_by text not null references users(id),
  expires_at integer not null,
  used_at integer,
  created_at integer not null
);
create index password_resets_user_idx on password_resets(user_id, used_at);
