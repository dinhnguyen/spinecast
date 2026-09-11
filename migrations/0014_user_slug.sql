alter table users add column slug text;

-- Backfill from the user id so existing catalog owners get a slug without a
-- separate script; new users are assigned a base32 slug by the worker.
update users set slug = substr(replace(id, '-', ''), 1, 6) where slug is null;

create unique index users_slug_idx on users(slug);
