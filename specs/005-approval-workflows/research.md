# Research: Approval Workflows

## Decision 1: BullMQ Queue Architecture

**Decision**: Use a single `notifications` queue with named jobs. Add a separate repeatable job for ticket expiration.
**Rationale**: BullMQ supports named jobs within a queue, so `slack-approval-notification` and `expire-pending-approvals` can share the `notifications` queue. The expiration job uses BullMQ's `repeat` option (every 5 minutes).
**Alternatives considered**:
- Separate queues per job type — unnecessary complexity for two jobs
- Cron-based expiration — external dependency; BullMQ repeatable jobs are self-contained

## Decision 2: Slack Integration Pattern

**Decision**: Use `@slack/web-api` (WebClient) for posting/updating messages. Use a raw Fastify route for Slack interactions (not @slack/bolt's Express receiver).
**Rationale**: @slack/bolt's built-in receiver is Express-based and conflicts with Fastify. Using `@slack/web-api` directly for outbound messages + a Fastify route with manual Slack signature verification for inbound interactions keeps everything within Fastify.
**Alternatives considered**:
- @slack/bolt with custom receiver — over-engineered for button clicks only
- Express middleware alongside Fastify — violates single-framework principle

## Decision 3: Policy Evaluation Stub

**Decision**: Create a `evaluatePolicy()` stub function in the approvals service that always returns `{ effect: 'REQUIRE_APPROVAL' }`. Import from a policies module when EPIC 5 is complete.
**Rationale**: The spec requires policy integration but EPIC 5 doesn't exist yet. A stub ensures the approval flow works end-to-end while being trivially replaceable.
**Alternatives considered**:
- Skip policy check entirely — would require restructuring when EPIC 5 lands
- Build a minimal policy engine now — scope creep; EPIC 5 has its own spec

## Decision 4: Ticket Expiration Strategy

**Decision**: BullMQ repeatable job every 5 minutes queries `WHERE status = 'PENDING' AND expiresAt < NOW()` and batch-updates to EXPIRED.
**Rationale**: Simple, reliable, and uses Prisma's updateMany for efficiency. 5-minute interval means tickets expire within 10 minutes of their deadline (per SC-004).
**Alternatives considered**:
- Per-ticket delayed job — creates thousands of BullMQ jobs; hard to manage
- Database trigger — violates Prisma-exclusive data access principle

## Decision 5: Slack Env Vars

**Decision**: Add `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_CHANNEL_ID` to env.ts as optional strings. When missing, Slack features are disabled with a warning log.
**Rationale**: Slack is a convenience layer (P3). Core approval workflow must function without Slack configured. Making env vars optional allows development/testing without Slack credentials.
**Alternatives considered**:
- Require Slack credentials — would break dev/test environments
- Separate Slack config file — inconsistent with Zod-validated env pattern

## Decision 6: Race Condition Handling

**Decision**: Use Prisma's `update` with a `where` clause that includes `status: 'PENDING'` as a filter. If no row matches (already resolved), throw a "Ticket already resolved" error.
**Rationale**: This is an optimistic concurrency pattern. The first writer wins; subsequent attempts find no PENDING row and fail gracefully. No explicit transaction needed for the update itself.
**Alternatives considered**:
- Explicit transaction with SELECT FOR UPDATE — overkill for single-row update
- Application-level mutex — doesn't work across multiple API instances
