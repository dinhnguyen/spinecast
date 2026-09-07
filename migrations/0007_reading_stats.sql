alter table users add column timezone text not null default '';
alter table reading_sessions add column device_id text;
alter table book_stats add column dirty integer not null default 0;
alter table global_stats add column dirty integer not null default 0;
