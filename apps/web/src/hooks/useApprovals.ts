import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { approvalsApi } from '@/lib/api'
import { approvalKeys } from '@/lib/queryClient'
import { useToast } from '@/hooks/use-toast'

export function useApprovalList(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: approvalKeys.list(params),
    queryFn: () => approvalsApi.list(params).then((r) => r.data),
  })
}

export function useApproval(id: string) {
  return useQuery({
    queryKey: approvalKeys.detail(id),
    queryFn: () => approvalsApi.getById(id).then((r) => r.data),
    enabled: !!id,
  })
}

export function useDecideApproval() {
  const qc = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: ({ id, decision, comment }: { id: string; decision: string; comment?: string }) =>
      approvalsApi.decide(id, { decision, comment }).then((r) => r.data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: approvalKeys.all })
      toast({ title: `Ticket ${variables.decision.toLowerCase()}` })
    },
    onError: () => {
      toast({ title: 'Failed to resolve ticket', variant: 'destructive' })
    },
  })
}
