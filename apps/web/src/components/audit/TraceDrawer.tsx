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
  errorMsg?: string | null
  createdAt?: string | Date
  metadata?: Record<string, unknown> | null
}

interface SpanNode {
  spanId: string | null
  parentSpanId: string | null
  events: TraceEvent[]
  children: SpanNode[]
  totalCost: number
  totalLatency: number
  hasFailure: boolean
  spanName: string | null
  errorMsg: string | null
}

const NO_SPAN_KEY = "__no_span__"

function buildSpanTree(events: TraceEvent[]): SpanNode[] {
  const groups = new Map<string, SpanNode>()

  for (const ev of events) {
    const key = ev.spanId ?? NO_SPAN_KEY
    let node = groups.get(key)
    if (!node) {
      node = {
        spanId: ev.spanId ?? null,
        parentSpanId: ev.parentSpanId ?? null,
        events: [],
        children: [],
        totalCost: 0,
        totalLatency: 0,
        hasFailure: false,
        spanName: null,
        errorMsg: null,
      }
      groups.set(key, node)
    }
    if (!node.parentSpanId && ev.parentSpanId) {
      node.parentSpanId = ev.parentSpanId
    }
    node.events.push(ev)
    const c = ev.costUsd ?? ev.cost
    if (typeof c === "number") node.totalCost += c
    const l = ev.latencyMs ?? ev.durationMs
    if (typeof l === "number") node.totalLatency += l
    if (ev.success === false || ev.error != null) node.hasFailure = true

    // SDK emits `span_failed` with the span name in metadata so the UI can
    // identify the span without a dedicated DB column.
    const eventType = ev.eventType ?? ev.event ?? ev.type
    if (eventType === "span_failed") {
      const meta = ev.metadata as { spanName?: unknown } | null | undefined
      if (meta && typeof meta.spanName === "string") {
        node.spanName = meta.spanName
      }
      node.errorMsg = ev.errorMsg ?? ev.error ?? node.errorMsg
    }
  }

  const roots: SpanNode[] = []
  for (const node of groups.values()) {
    const parentKey = node.parentSpanId
    if (parentKey && groups.has(parentKey)) {
      groups.get(parentKey)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const sortByTime = (a: SpanNode, b: SpanNode) => {
    const ta = new Date(a.events[0]?.createdAt ?? 0).getTime()
    const tb = new Date(b.events[0]?.createdAt ?? 0).getTime()
    return ta - tb
  }
  const sortRecursive = (nodes: SpanNode[]) => {
    nodes.sort(sortByTime)
    for (const n of nodes) sortRecursive(n.children)
  }
  sortRecursive(roots)

  return roots
}

function EventRow({ ev }: { ev: TraceEvent }) {
  const ok = ev.success !== false && ev.error == null
  const modelTool = ev.model ?? ev.toolName ?? ev.tool ?? ev.toolId ?? "—"
  const cost = ev.costUsd ?? ev.cost
  const lat = ev.latencyMs ?? ev.durationMs

  return (
    <div className="space-y-1 rounded-md border bg-muted/30 p-2">
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
      </div>
      <p className="font-mono text-xs text-muted-foreground">{modelTool}</p>
      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <span>Cost: {typeof cost === "number" ? formatUsd(cost) : "—"}</span>
        <span>Latency: {typeof lat === "number" ? formatDuration(lat) : "—"}</span>
      </div>
    </div>
  )
}

function SpanNodeView({ node, depth }: { node: SpanNode; depth: number }) {
  const indent = depth * 16
  const isSpan = node.spanId !== null

  return (
    <div>
      <div className="relative">
        <span
          className={`absolute -left-[21px] top-2 h-2.5 w-2.5 rounded-full ${
            node.hasFailure ? "bg-destructive" : "bg-primary"
          }`}
          style={{ marginLeft: indent }}
        />
        <div
          className="space-y-2 rounded-md border bg-card p-3"
          style={{ marginLeft: indent }}
        >
          {isSpan && (
            <div className="space-y-1 border-b pb-2">
              <div className="flex flex-wrap items-center gap-2">
                {node.spanName && (
                  <span className="text-xs font-semibold">{node.spanName}</span>
                )}
                {node.hasFailure && (
                  <Badge variant="destructive" className="text-[10px]">
                    Failed
                  </Badge>
                )}
                <span className="font-mono text-[10px] text-muted-foreground">
                  span:{node.spanId!.slice(0, 8)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {node.events.length} {node.events.length === 1 ? "event" : "events"}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Σ cost: {formatUsd(node.totalCost)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Σ latency: {formatDuration(node.totalLatency)}
                </span>
              </div>
              {node.errorMsg && (
                <p className="text-[11px] text-destructive">{node.errorMsg}</p>
              )}
            </div>
          )}
          <div className="space-y-2">
            {node.events.map((ev, i) => (
              <EventRow key={ev.id ?? `${node.spanId ?? "root"}-${i}`} ev={ev} />
            ))}
          </div>
        </div>
      </div>
      {node.children.length > 0 && (
        <div className="mt-3 space-y-3">
          {node.children.map((child) => (
            <SpanNodeView
              key={child.spanId ?? `${depth}-no-span`}
              node={child}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
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
                  tree.map((node, i) => (
                    <SpanNodeView
                      key={node.spanId ?? `root-${i}`}
                      node={node}
                      depth={0}
                    />
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
