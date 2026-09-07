create table passkeys (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  public_key text not null,
  counter integer not null default 0,
  transports text not null default '',
  name text not null,
  created_at integer not null,
  last_used_at integer
);
create index passkeys_user_idx on passkeys(user_id, created_at);
