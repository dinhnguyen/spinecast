create table book_blobs (
  content_hash text primary key,
  r2_key text not null,
  filesize integer not null,
  created_at integer not null
);

alter table books add column blob_hash text references book_blobs(content_hash) on delete set null;
create index books_blob_hash_idx on books(blob_hash);
