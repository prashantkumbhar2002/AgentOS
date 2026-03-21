/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react"
import { AuditFilterBar } from "@/components/audit/AuditFilterBar"
import { AUDIT_PAGE_SIZE, AuditTable } from "@/components/audit/AuditTable"
import { TraceDrawer } from "@/components/audit/TraceDrawer"
import { useAuditLogs, useExportCsv } from "@/hooks/useAuditLogs"
import { useAgentList } from "@/hooks/useAgents"
import { useAuthStore } from "@/store/useAuthStore"

function normalizeLogs(data: unknown): any[] {
  const d = data as any
  if (Array.isArray(d)) return d
  return d?.logs ?? d?.items ?? d?.data ?? []
}

export function AuditPage() {
  const user = useAuthStore((s) => s.user)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null)

  function handleFilterChange(next: Record<string, string>) {
    setFilters(next)
    setPage(1)
  }

  const queryParams = useMemo(
    () => ({
      ...filters,
      page,
      limit: AUDIT_PAGE_SIZE,
    }),
    [filters, page],
  )

  const { data, isLoading } = useAuditLogs(queryParams)
  const { data: agentsData } = useAgentList()
  const exportCsv = useExportCsv()

  const agents = useMemo(() => {
    const d = agentsData as any
    if (Array.isArray(d)) return d
    return d?.items ?? d?.data ?? []
  }, [agentsData])

  const logs = useMemo(() => normalizeLogs(data), [data])

  const role = String(user?.role ?? "").toLowerCase()
  const canExport = role === "admin" || role === "approver"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit</h1>
        <p className="text-muted-foreground">Inspect LLM and tool activity across agents.</p>
      </div>

      <AuditFilterBar filters={filters} onChange={handleFilterChange} agents={agents} />

      <AuditTable
        logs={logs}
        isLoading={isLoading}
        page={page}
        onPageChange={(p) => setPage(Math.max(1, p))}
        onSelectTrace={(id) => setSelectedTraceId(id)}
        canExport={canExport}
        onExport={() => exportCsv(queryParams)}
      />

      <TraceDrawer traceId={selectedTraceId} onClose={() => setSelectedTraceId(null)} />
    </div>
  )
}
