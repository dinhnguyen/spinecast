alter table bookmarks add column chapter text;
create index bookmarks_book_idx on bookmarks(book_id, deleted, percentage);
