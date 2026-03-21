import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '@/lib/api'
import { analyticsKeys } from '@/lib/queryClient'

export function useCostSummary(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: analyticsKeys.costs(params),
    queryFn: () => analyticsApi.getCosts(params).then((r) => r.data),
  })
}

export function useCostTimeline(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: analyticsKeys.timeline(params),
    queryFn: () => analyticsApi.getCostTimeline(params).then((r) => r.data),
  })
}

export function useUsageStats(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: analyticsKeys.usage(params),
    queryFn: () => analyticsApi.getUsage(params).then((r) => r.data),
  })
}

export function useAgentLeaderboard(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: analyticsKeys.agents(params),
    queryFn: () => analyticsApi.getAgents(params).then((r) => r.data),
  })
}

export function useModelUsage(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: analyticsKeys.models(params),
    queryFn: () => analyticsApi.getModels(params).then((r) => r.data),
  })
}
