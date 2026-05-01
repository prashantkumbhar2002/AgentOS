-- Adds LangSmith cross-link columns. Schema-only — no code path uses these
-- fields yet (PR3 will surface them in the dashboard's TraceDrawer; PR4 will
-- read them from a feedback worker; PR4's SDK fanout will write them).
--
-- All new columns are nullable / have safe defaults so:
--   * Historical rows remain valid without a backfill.
--   * Existing audit-ingest paths (no LangSmith config) keep writing nulls.
--   * Rolling back is a clean column drop.

-- AlterTable: AuditLog cross-link
ALTER TABLE "AuditLog" ADD COLUMN "langsmithRunId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "langsmithProject" TEXT;

-- AlterTable: Agent opt-in flag + project. Boolean defaults to FALSE so the
-- integration is OFF for every existing and new agent until an admin enables
-- it explicitly.
ALTER TABLE "Agent" ADD COLUMN "langsmithEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Agent" ADD COLUMN "langsmithProject" TEXT;

-- CreateIndex: reverse lookup from a LangSmith run id back to its AgentOS
-- audit row. Cheap to maintain (mostly null), used by the future feedback
-- worker and dashboard cross-link debugging.
CREATE INDEX "AuditLog_langsmithRunId_idx" ON "AuditLog"("langsmithRunId");
