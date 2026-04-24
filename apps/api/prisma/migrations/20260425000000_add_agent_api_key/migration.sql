-- Add agent API key columns for SDK authentication.
ALTER TABLE "Agent" ADD COLUMN "apiKeyHash" TEXT;
ALTER TABLE "Agent" ADD COLUMN "apiKeyHint" TEXT;

CREATE UNIQUE INDEX "Agent_apiKeyHash_key" ON "Agent"("apiKeyHash");
