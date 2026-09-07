alter table clippings add column cfi text;
create index clippings_book_idx on clippings(book_id, deleted, spine, para);
