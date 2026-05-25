import * as restate from '@restatedev/restate-sdk';
import { z } from 'zod';

// Input/Output schemas
const ResearchTaskInput = z.object({
  agentId: z.string(),
  traceId: z.string(),
  topic: z.string(),
  depth: z.enum(['quick', 'medium', 'deep']).default('medium'),
  requiresApproval: z.boolean().default(false),
  maxCostUsd: z.number().default(1.0),
  metadata: z.record(z.unknown()).optional(),
});

const ResearchTaskOutput = z.object({
  workflowId: z.string(),
  traceId: z.string(),
  status: z.enum(['COMPLETED', 'APPROVED', 'DENIED', 'FAILED', 'CANCELLED']),
  findings: z.string(),
  sources: z.array(z.string()),
  totalCostUsd: z.number(),
  durationMs: z.number(),
  tokensUsed: z.number(),
});

export type ResearchTaskInput = z.infer<typeof ResearchTaskInput>;
export type ResearchTaskOutput = z.infer<typeof ResearchTaskOutput>;

/**
 * Research Task Workflow
 * 
 * Durable workflow for multi-step research tasks with optional approval gates.
 * Demonstrates more complex workflow patterns:
 * - Multiple LLM calls
 * - Conditional approval gates
 * - Cost tracking across steps
 * - Crash recovery at any step
 * 
 * Flow:
 * 1. Generate research plan
 * 2. Execute research steps (multiple LLM calls)
 * 3. Optional approval gate before final synthesis
 * 4. Synthesize findings
 * 5. Create audit trail
 */
export const researchTaskWorkflow = restate.workflow({
  name: 'ResearchTaskWorkflow',
  handlers: {
    run: async (ctx: restate.WorkflowContext, input: unknown) => {
      const startTime = Date.now();
      
      // Validate input
      const validated = ResearchTaskInput.parse(input);
      const { agentId, traceId, topic, depth, requiresApproval, maxCostUsd } = validated;
      
      const workflowId = `wf_${ctx.rand.uuidv4()}`;
      
      ctx.console.info('Starting research task workflow', {
        workflowId,
        agentId,
        traceId,
        topic,
        depth,
      });

      let totalCost = 0;
      let tokensUsed = 0;
      let status: 'COMPLETED' | 'APPROVED' | 'DENIED' | 'FAILED' = 'COMPLETED';
      const sources: string[] = [];

      // Step 1: Generate research plan
      const plan = await ctx.run('generate_research_plan', async () => {
        ctx.console.info('Generating research plan for', { topic, depth });
        
        // TODO: Call LLM to generate research plan
        const steps = depth === 'quick' ? 2 : depth === 'medium' ? 4 : 6;
        
        totalCost += 0.01; // Plan generation cost
        tokensUsed += 500;
        
        return {
          steps: Array.from({ length: steps }, (_, i) => ({
            id: `step_${i + 1}`,
            query: `Research aspect ${i + 1} of ${topic}`,
          })),
        };
      });

      ctx.console.info('Research plan generated', { stepCount: plan.steps.length });

      // Step 2: Execute research steps
      const findings: string[] = [];
      for (const step of plan.steps) {
        // Check budget before each step
        if (totalCost >= maxCostUsd) {
          ctx.console.warn('Budget exceeded, stopping research', {
            totalCost,
            maxCostUsd,
          });
          break;
        }

        const stepResult = await ctx.run(`execute_${step.id}`, async () => {
          ctx.console.info('Executing research step', { stepId: step.id });
          
          // TODO: Call LLM for research
          const finding = `Finding for ${step.query}`;
          const source = `https://example.com/${step.id}`;
          
          totalCost += 0.05; // Per-step cost
          tokensUsed += 1000;
          
          return { finding, source };
        });

        findings.push(stepResult.finding);
        sources.push(stepResult.source);
      }

      ctx.console.info('Research steps completed', {
        findingsCount: findings.length,
        totalCost,
      });

      // Step 3: Optional approval gate
      if (requiresApproval) {
        ctx.console.info('Approval required before synthesis');

        const ticketId = await ctx.run('create_approval_ticket', async () => {
          // TODO: Call AgentOS API to create ticket
          return `ticket_${ctx.rand.uuidv4()}`;
        });

        const promiseName = `research_approval_${ticketId}`;
        const approvalResult = await ctx.promise<{
          decision: 'approved' | 'denied';
          feedback?: string;
        }>(promiseName);

        if (approvalResult.decision === 'denied') {
          status = 'DENIED';
          ctx.console.info('Research denied by human', { ticketId });
          
          const endTime = Date.now();
          return {
            workflowId,
            traceId,
            status,
            findings: '',
            sources,
            totalCostUsd: totalCost,
            durationMs: endTime - startTime,
            tokensUsed,
          };
        }

        status = 'APPROVED';
      }

      // Step 4: Synthesize findings
      const synthesis = await ctx.run('synthesize_findings', async () => {
        ctx.console.info('Synthesizing findings');
        
        // TODO: Call LLM to synthesize all findings
        const synthesized = findings.join('\n\n');
        
        totalCost += 0.02; // Synthesis cost
        tokensUsed += 800;
        
        return synthesized;
      });

      // Step 5: Create audit log
      await ctx.run('create_audit_log', async () => {
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

      const output: ResearchTaskOutput = {
        workflowId,
        traceId,
        status,
        findings: synthesis,
        sources,
        totalCostUsd: totalCost,
        durationMs,
        tokensUsed,
      };

      ctx.console.info('Research workflow completed', output);
      return output;
    },
  },
});
