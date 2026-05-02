/* eslint-disable @typescript-eslint/no-explicit-any */
// `any` is used pragmatically here because the API responses are defensively
// accessed via field-alias chains (camelCase + snake_case) and runtime guards
// (`Array.isArray`, `typeof === "number"`). Replacing with strict types
// requires a coordinated typing pass across the dashboard's API hooks; tracked
// as a follow-up cleanup PR.
import { useMemo } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useApprovalList } from "@/hooks/useApprovals"
import { formatRelativeTime } from "@/lib/formatters"

type AgentApprovalsTabProps = {
  agentId: string
}

function asApprovalArray(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>
    if (Array.isArray(o.data)) return o.data
    if (Array.isArray(o.items)) return o.items
    if (Array.isArray(o.approvals)) return o.approvals
  }
  return []
}

export function AgentApprovalsTab({ agentId }: AgentApprovalsTabProps) {
  const { data, isPending } = useApprovalList({ agentId })
  const rows = useMemo(() => asApprovalArray(data), [data])

  if (isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">No approvals for this agent.</p>
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Risk score</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Resolved</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r: any) => (
            <TableRow key={r.id}>
              <TableCell>{r.status ?? "—"}</TableCell>
              <TableCell>{r.actionType ?? r.action_type ?? "—"}</TableCell>
              <TableCell className="tabular-nums">
                {r.riskScore ?? r.risk_score ?? "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {r.createdAt ?? r.created_at
                  ? formatRelativeTime(r.createdAt ?? r.created_at)
                  : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {r.resolvedAt ?? r.resolved_at
                  ? formatRelativeTime(r.resolvedAt ?? r.resolved_at)
                  : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
