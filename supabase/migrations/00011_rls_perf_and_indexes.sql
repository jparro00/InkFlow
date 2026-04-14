-- Performance: fix RLS policies to evaluate auth.uid() once per query
-- instead of once per row, and add missing foreign key indexes.
--
-- Supabase docs: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

-- ============================================================
-- Missing foreign key indexes
-- ============================================================
create index if not exists idx_verification_codes_user on verification_codes(user_id);
create index if not exists idx_documents_booking on documents(booking_id);

-- ============================================================
-- Fix RLS policies: auth.uid() → (select auth.uid())
-- ============================================================

-- age_verification_logs
alter policy "Users can view own age verification logs" on age_verification_logs using ((select auth.uid()) = user_id);
alter policy "Users can insert own age verification logs" on age_verification_logs with check ((select auth.uid()) = user_id);
alter policy "Users can update own age verification logs" on age_verification_logs using ((select auth.uid()) = user_id);
alter policy "Users can delete own age verification logs" on age_verification_logs using ((select auth.uid()) = user_id);

-- booking_images
alter policy "Users can view own booking images" on booking_images using ((select auth.uid()) = user_id);
alter policy "Users can insert own booking images" on booking_images with check ((select auth.uid()) = user_id);
alter policy "Users can update own booking images" on booking_images using ((select auth.uid()) = user_id);
alter policy "Users can delete own booking images" on booking_images using ((select auth.uid()) = user_id);

-- bookings
alter policy "Users can view own bookings" on bookings using ((select auth.uid()) = user_id);
alter policy "Users can insert own bookings" on bookings with check ((select auth.uid()) = user_id);
alter policy "Users can update own bookings" on bookings using ((select auth.uid()) = user_id);
alter policy "Users can delete own bookings" on bookings using ((select auth.uid()) = user_id);

-- clients
alter policy "Users can view own clients" on clients using ((select auth.uid()) = user_id);
alter policy "Users can insert own clients" on clients with check ((select auth.uid()) = user_id);
alter policy "Users can update own clients" on clients using ((select auth.uid()) = user_id);
alter policy "Users can delete own clients" on clients using ((select auth.uid()) = user_id);

-- conversation_map (FOR ALL policy — update both clauses)
alter policy "Users manage own conversation map" on conversation_map using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- conversation_reads
alter policy "Users can view own reads" on conversation_reads using ((select auth.uid()) = user_id);
alter policy "Users can upsert own reads" on conversation_reads with check ((select auth.uid()) = user_id);
alter policy "Users can update own reads" on conversation_reads using ((select auth.uid()) = user_id);

-- device_trusts (FOR ALL policy)
alter policy "Users manage own devices" on device_trusts using ((select auth.uid()) = user_id);

-- documents
alter policy "Users can view own documents" on documents using ((select auth.uid()) = user_id);
alter policy "Users can insert own documents" on documents with check ((select auth.uid()) = user_id);
alter policy "Users can update own documents" on documents using ((select auth.uid()) = user_id);
alter policy "Users can delete own documents" on documents using ((select auth.uid()) = user_id);

-- messages
alter policy "Users can view own messages" on messages using ((select auth.uid()) = user_id);
alter policy "Users can insert own messages" on messages with check ((select auth.uid()) = user_id);
alter policy "Users can delete own messages" on messages using ((select auth.uid()) = user_id);

-- participant_profiles (FOR ALL policy — update both clauses)
alter policy "Users manage own participant profiles" on participant_profiles using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- user_settings
alter policy "Users can view own settings" on user_settings using ((select auth.uid()) = user_id);
alter policy "Users can insert own settings" on user_settings with check ((select auth.uid()) = user_id);
alter policy "Users can update own settings" on user_settings using ((select auth.uid()) = user_id);

-- verification_codes (FOR ALL policy)
alter policy "Users manage own codes" on verification_codes using ((select auth.uid()) = user_id);
