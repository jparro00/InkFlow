-- Maps our internal conversation_id (from webhook) to the real Graph API
-- conversation ID. Populated lazily on first fetchOlderMessages call, so
-- subsequent calls skip the full conversation-list scan.
create table conversation_map (
  conversation_id       text    not null,
  graph_conversation_id text    not null,
  user_id               uuid    not null references auth.users(id) on delete cascade,
  primary key (user_id, conversation_id)
);

alter table conversation_map enable row level security;

create policy "Users manage own conversation map"
  on conversation_map for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
