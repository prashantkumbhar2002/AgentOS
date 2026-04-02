import { z } from 'zod';

export const EmailAgentInputSchema = z.object({
  task: z.string().min(1),
});

export const ResearchAgentInputSchema = z.object({
  topic: z.string().min(1),
});

export const LocalAgentInputSchema = z.object({
  task: z.string().min(1),
  model: z.string().default('llama3.2'),
});
