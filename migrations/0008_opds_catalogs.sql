create table opds_catalogs (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  name text not null,
  url text not null,
  username text not null default '',
  password_enc text not null default '',
  created_at integer not null,
  last_ok_at integer,
  last_error text
);
create index opds_catalogs_user_idx on opds_catalogs(user_id, created_at);

alter table books add column source_catalog_id text references opds_catalogs(id) on delete set null;
alter table books add column source_entry_id text;
create index books_source_idx on books(user_id, source_catalog_id, source_entry_id);
