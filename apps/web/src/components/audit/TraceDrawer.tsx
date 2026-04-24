/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventBadge } from "@/components/audit/AuditTable"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { useTrace } from "@/hooks/useAuditLogs"
import { formatDuration, formatRelativeTime, formatUsd } from "@/lib/formatters"
import { useMemo } from "react"

export interface TraceDrawerProps {
  traceId: string | null
  onClose: () => void
}

interface TraceEvent {
  id?: string
  spanId?: string | null
  parentSpanId?: string | null
  event?: string
  eventType?: string
  type?: string
  model?: string | null
  toolName?: string | null
  tool?: string | null
  toolId?: string | null
  costUsd?: number | null
  cost?: number | null
  latencyMs?: number | null
  durationMs?: number | null
  success?: boolean
  error?: string | null
  createdAt?: string | Date
  children?: TraceEvent[]
}

function buildSpanTree(events: TraceEvent[]): TraceEvent[] {
  const bySpanId = new Map<string, TraceEvent>()
  const roots: TraceEvent[] = []

  for (const ev of events) {
    const node: TraceEvent = { ...ev, children: [] }
    if (ev.spanId) {
      bySpanId.set(ev.spanId, node)
    }
    // temporarily collect all as potential roots
    roots.push(node)
  }

  // re-parent children
  const actualRoots: TraceEvent[] = []
  for (const node of roots) {
    if (node.parentSpanId && bySpanId.has(node.parentSpanId)) {
      bySpanId.get(node.parentSpanId)!.children!.push(node)
    } else {
      actualRoots.push(node)
    }
  }

  return actualRoots
}

function EventNode({ ev, depth }: { ev: TraceEvent; depth: number }) {
  const ok = ev.success !== false && ev.error == null
  const modelTool = ev.model ?? ev.toolName ?? ev.tool ?? ev.toolId ?? "—"
  const cost = ev.costUsd ?? ev.cost
  const lat = ev.latencyMs ?? ev.durationMs
  const hasChildren = ev.children && ev.children.length > 0

  return (
    <div>
      <div className="relative">
        <span
          className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary"
          style={{ marginLeft: depth * 16 }}
        />
        <div
          className="space-y-2 rounded-md border bg-muted/30 p-3"
          style={{ marginLeft: depth * 16 }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <EventBadge type={ev.eventType ?? ev.event ?? ev.type} />
            <span className="text-xs text-muted-foreground">
              {ev.createdAt ? formatRelativeTime(ev.createdAt) : "—"}
            </span>
            {ok ? (
              <Badge className="bg-emerald-600 text-[10px] hover:bg-emerald-600">OK</Badge>
            ) : (
              <Badge variant="destructive" className="text-[10px]">
                Fail
              </Badge>
            )}
            {ev.spanId && (
              <span className="font-mono text-[10px] text-muted-foreground/60">
                span:{ev.spanId.slice(0, 8)}
              </span>
            )}
          </div>
          <p className="font-mono text-xs text-muted-foreground">{modelTool}</p>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>Cost: {typeof cost === "number" ? formatUsd(cost) : "—"}</span>
            <span>Latency: {typeof lat === "number" ? formatDuration(lat) : "—"}</span>
          </div>
        </div>
      </div>
      {hasChildren &&
        ev.children!.map((child, i) => (
          <EventNode key={child.id ?? `${depth}-${i}`} ev={child} depth={depth + 1} />
        ))}
    </div>
  )
}

export function TraceDrawer({ traceId, onClose }: TraceDrawerProps) {
  const { data, isLoading } = useTrace(traceId ?? "")

  const trace = data as any
  const events = useMemo(() => {
    const raw = [...(trace?.events ?? trace?.logs ?? [])].sort(
      (a: any, b: any) =>
        new Date(a?.createdAt ?? 0).getTime() - new Date(b?.createdAt ?? 0).getTime(),
    )
    return raw
  }, [trace])

  const tree = useMemo(() => buildSpanTree(events), [events])

  const totalCost = events.reduce((sum: number, e: any) => {
    const c = e?.costUsd ?? e?.cost
    return sum + (typeof c === "number" ? c : 0)
  }, 0)

  const totalLatency = events.reduce((sum: number, e: any) => {
    const ms = e?.latencyMs ?? e?.durationMs
    return sum + (typeof ms === "number" ? ms : 0)
  }, 0)

  if (!traceId) return null

  return (
    <Sheet
      open={!!traceId}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Trace</SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
            <div className="space-y-1 text-sm">
              <p className="text-muted-foreground">Trace ID</p>
              <p className="break-all font-mono text-xs">{traceId}</p>
              <p className="pt-2 text-muted-foreground">Agent</p>
              <p className="font-medium">{trace?.agentName ?? trace?.agent?.name ?? "—"}</p>
              <div className="flex flex-wrap gap-4 pt-2">
                <div>
                  <p className="text-xs text-muted-foreground">Total cost</p>
                  <p className="font-semibold tabular-nums">{formatUsd(totalCost)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total latency</p>
                  <p className="font-semibold tabular-nums">{formatDuration(totalLatency)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Events</p>
                  <p className="font-semibold tabular-nums">{events.length}</p>
                </div>
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1 pr-3">
              <div className="relative space-y-6 border-l border-border pl-4">
                {tree.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No events in this trace.</p>
                ) : (
                  tree.map((ev, i) => (
                    <EventNode key={ev.id ?? i} ev={ev} depth={0} />
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
