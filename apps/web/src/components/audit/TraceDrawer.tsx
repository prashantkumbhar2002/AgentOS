/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventBadge } from "@/components/audit/AuditTable"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { useTrace } from "@/hooks/useAuditLogs"
import { formatDuration, formatRelativeTime, formatUsd } from "@/lib/formatters"

export interface TraceDrawerProps {
  traceId: string | null
  onClose: () => void
}

export function TraceDrawer({ traceId, onClose }: TraceDrawerProps) {
  const { data, isLoading } = useTrace(traceId ?? "")

  if (!traceId) return null

  const trace = data as any
  const events = [...(trace?.events ?? trace?.logs ?? [])].sort(
    (a, b) =>
      new Date(a?.createdAt ?? 0).getTime() - new Date(b?.createdAt ?? 0).getTime(),
  )

  const totalCost = events.reduce((sum, e) => {
    const c = e?.costUsd ?? e?.cost
    return sum + (typeof c === "number" ? c : 0)
  }, 0)

  const totalLatency = events.reduce((sum, e) => {
    const ms = e?.latencyMs ?? e?.durationMs
    return sum + (typeof ms === "number" ? ms : 0)
  }, 0)

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
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1 pr-3">
              <div className="relative space-y-6 border-l border-border pl-4">
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No events in this trace.</p>
                ) : (
                  events.map((ev, i) => {
                    const ok = ev?.success !== false && ev?.error == null
                    const modelTool =
                      ev?.model ?? ev?.toolName ?? ev?.tool ?? ev?.toolId ?? "—"
                    const cost = ev?.costUsd ?? ev?.cost
                    const lat = ev?.latencyMs ?? ev?.durationMs
                    return (
                      <div key={ev?.id ?? i} className="relative">
                        <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <EventBadge type={ev?.eventType ?? ev?.event ?? ev?.type} />
                            <span className="text-xs text-muted-foreground">
                              {ev?.createdAt ? formatRelativeTime(ev.createdAt) : "—"}
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
                          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                            <span>Cost: {typeof cost === "number" ? formatUsd(cost) : "—"}</span>
                            <span>Latency: {typeof lat === "number" ? formatDuration(lat) : "—"}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
