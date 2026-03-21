import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { agentsApi } from '@/lib/api'
import { agentKeys } from '@/lib/queryClient'
import { useToast } from '@/hooks/use-toast'

export function useAgentList(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: agentKeys.list(params),
    queryFn: () => agentsApi.list(params).then((r) => r.data),
  })
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: agentKeys.detail(id),
    queryFn: () => agentsApi.getById(id).then((r) => r.data),
    enabled: !!id,
  })
}

export function useCreateAgent() {
  const qc = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => agentsApi.create(data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentKeys.all })
      toast({ title: 'Agent registered successfully' })
    },
    onError: () => {
      toast({ title: 'Failed to register agent', variant: 'destructive' })
    },
  })
}

export function useUpdateAgent(id: string) {
  const qc = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => agentsApi.update(id, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentKeys.all })
      toast({ title: 'Agent updated' })
    },
  })
}

export function useUpdateAgentStatus(id: string) {
  const qc = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: (data: { status: string }) => agentsApi.updateStatus(id, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentKeys.all })
      toast({ title: 'Agent status updated' })
    },
  })
}

export function useDeleteAgent(id: string) {
  const qc = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: () => agentsApi.remove(id).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentKeys.all })
      toast({ title: 'Agent deleted' })
    },
  })
}
