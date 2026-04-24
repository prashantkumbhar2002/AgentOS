-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "spanId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "parentSpanId" TEXT;

-- AlterTable
ALTER TABLE "Agent" ADD COLUMN "budgetUsd" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "AuditLog_spanId_idx" ON "AuditLog"("spanId");
