-- AlterTable
ALTER TABLE "WorkflowDefinition" ADD COLUMN     "entryNodeId" TEXT,
ADD COLUMN     "isDag" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "WorkflowDefinition_isDag_idx" ON "WorkflowDefinition"("isDag");
