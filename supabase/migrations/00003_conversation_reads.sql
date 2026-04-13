-- Lightweight read state tracking for conversations
create table conversation_reads (
  user_id          uuid not null references auth.users(id) on delete cascade,
  conversation_id  text not null,
  last_read_mid    text not null,
  primary key (user_id, conversation_id)
);

alter table conversation_reads enable row level security;

create policy "Users can view own reads"
  on conversation_reads for select using (auth.uid() = user_id);
create policy "Users can upsert own reads"
  on conversation_reads for insert with check (auth.uid() = user_id);
create policy "Users can update own reads"
  on conversation_reads for update using (auth.uid() = user_id);
