import { useQuery } from '@tanstack/react-query'
import { policiesApi } from '@/lib/api'
import { policyKeys } from '@/lib/queryClient'

export function usePolicyList(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: policyKeys.lists(),
    queryFn: () => policiesApi.list(params).then((r) => r.data),
  })
}

export function usePolicy(id: string) {
  return useQuery({
    queryKey: policyKeys.detail(id),
    queryFn: () => policiesApi.getById(id).then((r) => r.data),
    enabled: !!id,
  })
}
