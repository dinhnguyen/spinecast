create table devices (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  name text not null,
  created_at integer not null,
  last_seen_at integer not null
);
create index devices_user_idx on devices(user_id, last_seen_at desc);

alter table reading_progress add column device_id text;
alter table reading_progress add column observed_at integer;
