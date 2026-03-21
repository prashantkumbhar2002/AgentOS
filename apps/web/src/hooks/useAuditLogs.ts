import { useQuery } from '@tanstack/react-query'
import { auditApi } from '@/lib/api'
import { auditKeys } from '@/lib/queryClient'

export function useAuditLogs(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: auditKeys.list(params),
    queryFn: () => auditApi.getLogs(params).then((r) => r.data),
  })
}

export function useTrace(traceId: string) {
  return useQuery({
    queryKey: auditKeys.trace(traceId),
    queryFn: () => auditApi.getTrace(traceId).then((r) => r.data),
    enabled: !!traceId,
  })
}

export function useAgentAuditStats(agentId: string) {
  return useQuery({
    queryKey: auditKeys.stats(agentId),
    queryFn: () => auditApi.getStats(agentId).then((r) => r.data),
    enabled: !!agentId,
  })
}

export function useExportCsv() {
  return async (params?: Record<string, unknown>) => {
    const response = await auditApi.exportCsv(params)
    const blob = new Blob([response.data as BlobPart], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }
}
