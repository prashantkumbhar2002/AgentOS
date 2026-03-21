import { useEffect, useRef } from "react"

import { EmptyState } from "@/components/shared/EmptyState"
import { EventBadge } from "@/components/shared/EventBadge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useSSE, type SSEEvent } from "@/hooks/useSSE"
import { formatRelativeTime } from "@/lib/formatters"
import { cn } from "@/lib/utils"

function describeEvent(event: SSEEvent): string {
  const { data } = event
  for (const key of ["message", "reasoning", "summary"] as const) {
    const v = data[key]
    if (typeof v === "string" && v.length > 0) return v
  }
  const action = data.actionType
  if (typeof action === "string" && action.length > 0) return action
  const agent = data.agentName ?? data.agentId
  if (typeof agent === "string" && agent.length > 0) return agent
  try {
    return JSON.stringify(data).slice(0, 160)
  } catch {
    return event.type
  }
}

export function LiveActivityFeed() {
  const { events, isConnected } = useSSE()
  const areaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const viewport = areaRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]",
    ) as HTMLElement | null
    if (viewport) viewport.scrollTop = 0
  }, [events])

  return (
    <div className="flex h-[420px] flex-col rounded-lg border bg-card text-card-foreground shadow-sm">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
        <span
          className={cn(
            "size-2 shrink-0 rounded-full",
            isConnected ? "bg-green-500" : "bg-muted-foreground/50",
          )}
          aria-hidden
        />
        {isConnected ? "Live" : "Reconnecting…"}
      </div>
      {events.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4">
          <EmptyState
            title="No activity yet"
            description="Events from your agents will appear here when the stream is connected."
          />
        </div>
      ) : (
        <ScrollArea ref={areaRef} className="min-h-0 flex-1">
          <div className="flex flex-col">
            {events.map((event) => (
              <div
                key={event.id}
                className="border-b border-border/60 px-3 py-2.5 text-sm last:border-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(event.timestamp)}
                  </span>
                  <EventBadge type={event.type} />
                </div>
                <p className="mt-1 line-clamp-2 text-muted-foreground">{describeEvent(event)}</p>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
