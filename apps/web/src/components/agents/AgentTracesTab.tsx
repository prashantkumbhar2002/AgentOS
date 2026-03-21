import { useMemo } from "react"
import { EventBadge } from "@/components/shared"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuditLogs } from "@/hooks/useAuditLogs"
import { formatDuration, formatRelativeTime, formatUsd } from "@/lib/formatters"

type AgentTracesTabProps = {
  agentId: string
}

function asLogArray(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>
    if (Array.isArray(o.data)) return o.data
    if (Array.isArray(o.logs)) return o.logs
    if (Array.isArray(o.items)) return o.items
  }
  return []
}

function eventTime(e: any): number {
  const s = e.timestamp ?? e.createdAt ?? e.created_at ?? e.time
  return s ? new Date(s).getTime() : 0
}

export function AgentTracesTab({ agentId }: AgentTracesTabProps) {
  const { data, isPending } = useAuditLogs({ agentId })
  const logs = useMemo(() => asLogArray(data), [data])

  const groups = useMemo(() => {
    const m = new Map<string, any[]>()
    for (const e of logs) {
      const tid = String(e.traceId ?? e.trace_id ?? "unknown")
      if (!m.has(tid)) m.set(tid, [])
      m.get(tid)!.push(e)
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => eventTime(a) - eventTime(b))
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [logs])

  if (isPending) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  if (!groups.length) {
    return <p className="text-sm text-muted-foreground">No audit traces for this agent.</p>
  }

  return (
    <Accordion type="single" collapsible className="w-full">
      {groups.map(([traceId, events]) => (
        <AccordionItem key={traceId} value={traceId}>
          <AccordionTrigger className="text-left">
            <span className="font-mono text-sm">{traceId}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {events.length} event{events.length === 1 ? "" : "s"}
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <ol className="relative space-y-4 border-l border-border pl-4">
              {events.map((e, idx) => {
                const ts = e.timestamp ?? e.createdAt ?? e.created_at
                const type = e.eventType ?? e.type ?? e.event_type
                const model = e.model ?? e.modelName
                const tool = e.toolName ?? e.tool ?? e.tool_name
                const mt = [model, tool].filter(Boolean).join(" · ") || "—"
                const cost =
                  typeof e.costUsd === "number"
                    ? e.costUsd
                    : typeof e.cost_usd === "number"
                      ? e.cost_usd
                      : typeof e.cost === "number"
                        ? e.cost
                        : 0
                const lat =
                  typeof e.latencyMs === "number"
                    ? e.latencyMs
                    : typeof e.latency_ms === "number"
                      ? e.latency_ms
                      : typeof e.latency === "number"
                        ? e.latency
                        : 0
                return (
                  <li key={e.id ?? idx} className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <EventBadge type={type} />
                      {ts ? (
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(ts)}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-sm">{mt}</div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>Cost {formatUsd(cost)}</span>
                      <span>Latency {formatDuration(lat)}</span>
                    </div>
                  </li>
                )
              })}
            </ol>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
