create table users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('admin', 'user')),
  created_at integer not null
);

create table invites (
  code text primary key,
  created_by text not null references users(id),
  used_by text references users(id),
  expires_at integer not null,
  created_at integer not null
);

create table books (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  title text not null,
  author text not null default '',
  filename text not null,
  filesize integer not null,
  r2_key text not null,
  cover_r2_key text,
  hash_partial text not null,
  hash_filename text not null,
  created_at integer not null,
  last_opened_at integer,
  unique (user_id, hash_partial)
);
create index books_user_idx on books(user_id, last_opened_at desc, created_at desc);

create table sync_settings (
  user_id text primary key references users(id) on delete cascade,
  server_url text not null,
  username text not null,
  auth_key_enc text not null,
  hash_method text not null default 'partial' check (hash_method in ('partial', 'filename')),
  device_name text not null default 'Spinecast',
  device_id text not null,
  enabled integer not null default 1,
  last_ok_at integer,
  last_error text
);

create table reading_progress (
  book_id text primary key references books(id) on delete cascade,
  pct_q integer not null,
  spine integer not null,
  xpath text,
  para integer,
  anchor text,
  page integer,
  pages integer,
  updated_at integer not null,
  last_pushed_at integer
);

create table bookmarks (
  id text not null,
  book_id text not null references books(id) on delete cascade,
  xpath text not null,
  percentage real,
  summary text,
  si integer, pc integer, pp integer,
  deleted integer not null default 0,
  updated_at integer not null,
  dirty integer not null default 1,
  primary key (book_id, id)
);

create table clippings (
  id text not null,
  book_id text not null references books(id) on delete cascade,
  spine integer,
  start_page integer, end_page integer, pages integer,
  start_word integer, end_word integer, words integer,
  para integer,
  chapter text,
  text text not null,
  note text,
  color text,
  created_at integer not null,
  deleted integer not null default 0,
  updated_at integer not null,
  dirty integer not null default 1,
  primary key (book_id, id)
);

create table sync_cursors (
  user_id text not null references users(id) on delete cascade,
  book_id text not null references books(id) on delete cascade,
  kind text not null check (kind in ('bookmarks', 'clippings')),
  since integer not null default 0,
  primary key (user_id, book_id, kind)
);

create table reading_sessions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  book_id text not null references books(id) on delete cascade,
  started_at integer not null,
  ended_at integer not null,
  seconds integer not null,
  pages integer not null
);
create index reading_sessions_user_idx on reading_sessions(user_id, started_at);

create table book_stats (
  book_id text primary key references books(id) on delete cascade,
  v integer not null default 5,
  sessions integer not null default 0,
  seconds integer not null default 0,
  pages integer not null default 0,
  completed integer not null default 0,
  avg_fwd integer not null default 0,
  pace_n integer not null default 0,
  eta integer not null default 0,
  start_manual integer not null default 0,
  finish_manual integer not null default 0,
  start_date integer not null default 0,
  finished_date integer not null default 0,
  tod text not null default '[0,0,0,0]',
  dow text not null default '[0,0,0,0,0,0,0]',
  pushed_at integer
);

create table global_stats (
  user_id text primary key references users(id) on delete cascade,
  v integer not null default 5,
  sessions integer not null default 0,
  seconds integer not null default 0,
  pages integer not null default 0,
  completed integer not null default 0,
  tod text not null default '[0,0,0,0]',
  dow text not null default '[0,0,0,0,0,0,0]',
  anchor_day integer not null default 0,
  history_b64 text not null default '',
  streak integer not null default 0,
  pushed_at integer
);
