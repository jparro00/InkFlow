-- Add DELETE policy on feedback so the owner can remove their own entries.
-- The original migration that created this table (a pre-versioned ad-hoc
-- create — no migration file exists for it) only added SELECT and INSERT
-- policies. Without DELETE, even admin cleanup via the REST API silently
-- no-ops. The MCP/service-role bypass works on prod, but dev cleanup
-- requires this policy.

CREATE POLICY "Users can delete own feedback"
  ON public.feedback FOR DELETE
  USING ((SELECT auth.uid()) = user_id);
