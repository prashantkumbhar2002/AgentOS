import * as restate from '@restatedev/restate-sdk';
import { z } from 'zod';

// Input/Output schemas
const EmailApprovalInput = z.object({
  agentId: z.string(),
  traceId: z.string(),
  task: z.string(),
  subject: z.string(),
  body: z.string(),
  riskScore: z.number(),
  reasoning: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

const EmailApprovalOutput = z.object({
  workflowId: z.string(),
  traceId: z.string(),
  status: z.enum(['APPROVED', 'DENIED', 'EXPIRED', 'CANCELLED']),
  ticketId: z.string().optional(),
  emailSent: z.boolean(),
  subject: z.string(),
  body: z.string(),
  totalCostUsd: z.number(),
  durationMs: z.number(),
});

export type EmailApprovalInput = z.infer<typeof EmailApprovalInput>;
export type EmailApprovalOutput = z.infer<typeof EmailApprovalOutput>;

/**
 * Email Approval Workflow
 * 
 * Durable workflow for email drafting with human-in-the-loop approval.
 * Uses Restate durable promises to wait for approval without polling.
 * 
 * Flow:
 * 1. Draft email using LLM
 * 2. Check policy (may require approval)
 * 3. If approval needed, create ticket and wait durably
 * 4. Once approved, send email
 * 5. Log audit trail
 */
export const emailApprovalWorkflow = restate.workflow({
  name: 'EmailApprovalWorkflow',
  handlers: {
    run: async (ctx: restate.WorkflowContext, input: unknown) => {
      const startTime = Date.now();
      
      // Validate input
      const validated = EmailApprovalInput.parse(input);
      const { agentId, traceId, subject, body, riskScore, metadata } = validated;
      
      // Generate unique workflow ID from context
      const workflowId = `wf_${ctx.rand.uuidv4()}`;
      
      ctx.console.info('Starting email approval workflow', {
        workflowId,
        agentId,
        traceId,
        riskScore,
      });

      let totalCost = 0;
      let ticketId: string | undefined;
      let status: 'APPROVED' | 'DENIED' | 'EXPIRED' | 'CANCELLED' = 'APPROVED';
      let emailSent = false;

      // Step 1: Draft email using LLM (already done, passed as input)
      ctx.console.info('Email drafted', { subject });

      // Step 2: Check policy and create approval ticket if needed
      const policyDecision = await ctx.run('check_policy', async () => {
        // TODO: Call AgentOS API to check policy
        // For now, simulate: high risk requires approval
        return {
          requiresApproval: riskScore > 0.7,
          policyId: 'default-email-policy',
        };
      });

      totalCost += 0.0001; // Policy check cost

      if (policyDecision.requiresApproval) {
        ctx.console.info('Approval required, creating ticket');

        // Step 3: Create approval ticket
        ticketId = await ctx.run('create_approval_ticket', async () => {
          // TODO: Call AgentOS API to create ticket
          // For now, generate a mock ticket ID
          return `ticket_${ctx.rand.uuidv4()}`;
        });

        ctx.console.info('Waiting for human approval', { ticketId });

        // Step 4: Wait durably for approval using Restate promise
        // This is the key difference from polling - the workflow suspends here
        // and only resumes when the promise is resolved (by the API when human approves)
        const promiseName = `approval_${ticketId}`;
        const approvalResult = await ctx.promise<{
          decision: 'approved' | 'denied' | 'expired';
          approvedBy?: string;
          approvedAt?: string;
        }>(promiseName);

        ctx.console.info('Approval received', approvalResult);

        if (approvalResult.decision === 'approved') {
          status = 'APPROVED';
        } else if (approvalResult.decision === 'denied') {
          status = 'DENIED';
        } else {
          status = 'EXPIRED';
        }
      }

      // Step 5: Send email if approved
      if (status === 'APPROVED') {
        await ctx.run('send_email', async () => {
          // TODO: Call actual email sending service
          ctx.console.info('Sending email', { subject, to: metadata?.recipient });
          emailSent = true;
          return { sent: true };
        });

        totalCost += 0.0002; // Email sending cost
      }

      // Step 6: Create audit log
      await ctx.run('create_audit_log', async () => {
        // TODO: Call AgentOS API to log execution
        ctx.console.info('Creating audit log', {
          agentId,
          traceId,
          workflowId,
          status,
        });
        return { logged: true };
      });

      const endTime = Date.now();
      const durationMs = endTime - startTime;

      const output: EmailApprovalOutput = {
        workflowId,
        traceId,
        status,
        ticketId,
        emailSent,
        subject,
        body,
        totalCostUsd: totalCost,
        durationMs,
      };

      ctx.console.info('Workflow completed', output);
      return output;
    },
  },
});
