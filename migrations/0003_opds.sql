alter table books add column shared integer not null default 0;

create table opds_tokens (
  user_id text not null references users(id) on delete cascade,
  scope text not null check (scope in ('library', 'public')),
  token_hash text not null,
  created_at integer not null,
  last_used_at integer,
  primary key (user_id, scope)
);
