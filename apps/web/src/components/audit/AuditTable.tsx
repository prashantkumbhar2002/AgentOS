/* eslint-disable @typescript-eslint/no-explicit-any */
import { Check, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDuration, formatRelativeTime, formatUsd } from "@/lib/formatters"

const PAGE_SIZE = 20

export function EventBadge({ type }: { type?: string }) {
  const t = String(type ?? "unknown")
  return (
    <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wide">
      {t.replace(/_/g, " ")}
    </Badge>
  )
}

export interface AuditTableProps {
  logs: any[]
  isLoading: boolean
  onSelectTrace: (traceId: string) => void
  page: number
  onPageChange: (p: number) => void
  canExport: boolean
  onExport: () => void
}

export function AuditTable({
  logs,
  isLoading,
  onSelectTrace,
  page,
  onPageChange,
  canExport,
  onExport,
}: AuditTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2 rounded-lg border p-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  const canPrev = page > 1
  const canNext = logs.length >= PAGE_SIZE

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={!canPrev} onClick={() => onPageChange(page - 1)}>
            Previous
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!canNext} onClick={() => onPageChange(page + 1)}>
            Next
          </Button>
        </div>
        {canExport && (
          <Button type="button" variant="secondary" size="sm" onClick={onExport}>
            Export CSV
          </Button>
        )}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Model / Tool</TableHead>
              <TableHead>Tokens</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Latency</TableHead>
              <TableHead className="text-center">Success</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  No audit logs match your filters.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => {
                const traceId = String(log?.traceId ?? "")
                const inTok = log?.inputTokens ?? log?.tokensIn ?? log?.promptTokens
                const outTok = log?.outputTokens ?? log?.tokensOut ?? log?.completionTokens
                const cost = log?.costUsd ?? log?.cost ?? 0
                const lat = log?.latencyMs ?? log?.durationMs ?? 0
                const ok = log?.success !== false && log?.error == null
                const modelTool =
                  log?.model ?? log?.toolName ?? log?.tool ?? log?.toolId ?? "—"
                return (
                  <TableRow
                    key={log?.id ?? `${traceId}-${log?.createdAt}`}
                    className="cursor-pointer"
                    onClick={() => traceId && onSelectTrace(traceId)}
                  >
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {log?.createdAt ? formatRelativeTime(log.createdAt) : "—"}
                    </TableCell>
                    <TableCell>{log?.agentName ?? log?.agent?.name ?? "—"}</TableCell>
                    <TableCell>
                      <EventBadge type={log?.eventType ?? log?.event ?? log?.type} />
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate font-mono text-xs">{modelTool}</TableCell>
                    <TableCell className="tabular-nums text-xs text-muted-foreground">
                      {inTok != null || outTok != null ? (
                        <>
                          {inTok ?? "—"} / {outTok ?? "—"}
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {typeof cost === "number" ? formatUsd(cost) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {typeof lat === "number" ? formatDuration(lat) : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {ok ? (
                        <Check className="mx-auto h-4 w-4 text-emerald-500" aria-label="Success" />
                      ) : (
                        <X className="mx-auto h-4 w-4 text-red-500" aria-label="Failed" />
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export { PAGE_SIZE as AUDIT_PAGE_SIZE }
