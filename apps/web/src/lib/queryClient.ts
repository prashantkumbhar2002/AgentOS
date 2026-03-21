import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

export const agentKeys = {
  all: ["agents"] as const,
  lists: () => [...agentKeys.all, "list"] as const,
  list: (filters?: Record<string, unknown>) => [...agentKeys.lists(), filters] as const,
  details: () => [...agentKeys.all, "detail"] as const,
  detail: (id: string) => [...agentKeys.details(), id] as const,
}

export const approvalKeys = {
  all: ["approvals"] as const,
  lists: () => [...approvalKeys.all, "list"] as const,
  list: (filters?: Record<string, unknown>) => [...approvalKeys.lists(), filters] as const,
  details: () => [...approvalKeys.all, "detail"] as const,
  detail: (id: string) => [...approvalKeys.details(), id] as const,
}

export const auditKeys = {
  all: ["audit"] as const,
  lists: () => [...auditKeys.all, "list"] as const,
  list: (filters?: Record<string, unknown>) => [...auditKeys.lists(), filters] as const,
  traces: () => [...auditKeys.all, "trace"] as const,
  trace: (traceId: string) => [...auditKeys.traces(), traceId] as const,
  stats: (agentId: string) => [...auditKeys.all, "stats", agentId] as const,
}

export const analyticsKeys = {
  all: ["analytics"] as const,
  costs: (params?: Record<string, unknown>) => [...analyticsKeys.all, "costs", params] as const,
  timeline: (params?: Record<string, unknown>) =>
    [...analyticsKeys.all, "timeline", params] as const,
  usage: (params?: Record<string, unknown>) => [...analyticsKeys.all, "usage", params] as const,
  agents: (params?: Record<string, unknown>) => [...analyticsKeys.all, "agents", params] as const,
  models: (params?: Record<string, unknown>) => [...analyticsKeys.all, "models", params] as const,
}

export const policyKeys = {
  all: ["policies"] as const,
  lists: () => [...policyKeys.all, "list"] as const,
  details: () => [...policyKeys.all, "detail"] as const,
  detail: (id: string) => [...policyKeys.details(), id] as const,
}
