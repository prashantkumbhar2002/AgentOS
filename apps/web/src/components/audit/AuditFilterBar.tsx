/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const EVENT_TYPES = [
  "llm_call",
  "tool_call",
  "approval_requested",
  "approval_resolved",
  "action_blocked",
] as const

export interface AuditFilterBarProps {
  filters: Record<string, string>
  onChange: (f: Record<string, string>) => void
  agents: any[]
}

export function AuditFilterBar({ filters, onChange, agents }: AuditFilterBarProps) {
  const filtersRef = useRef(filters)

  useEffect(() => {
    filtersRef.current = filters
  }, [filters])

  const [traceDraft, setTraceDraft] = useState(filters.traceId ?? "")

  useEffect(() => {
    setTraceDraft(filters.traceId ?? "")
  }, [filters.traceId])

  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = traceDraft.trim()
      if ((filtersRef.current.traceId ?? "") !== next) {
        onChange({ ...filtersRef.current, traceId: next })
      }
    }, 300)
    return () => window.clearTimeout(t)
  }, [traceDraft, onChange])

  function patch(partial: Record<string, string>) {
    onChange({ ...filtersRef.current, ...partial })
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 md:flex-row md:flex-wrap md:items-end">
      <div className="grid w-full gap-2 md:w-[200px]">
        <Label>Agent</Label>
        <Select
          value={filters.agentId || "all"}
          onValueChange={(v) => patch({ agentId: v === "all" ? "" : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="All agents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All agents</SelectItem>
            {(agents ?? []).map((a) => (
              <SelectItem key={a?.id ?? a?.name} value={String(a?.id ?? "")}>
                {a?.name ?? a?.id ?? "Agent"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid w-full gap-2 md:w-[220px]">
        <Label>Event type</Label>
        <Select
          value={filters.eventType || "all"}
          onValueChange={(v) => patch({ eventType: v === "all" ? "" : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="All events" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            {EVENT_TYPES.map((et) => (
              <SelectItem key={et} value={et}>
                {et.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid w-full gap-2 md:w-[160px]">
        <Label htmlFor="audit-from">From</Label>
        <Input
          id="audit-from"
          type="date"
          value={filters.fromDate ?? ""}
          onChange={(e) => patch({ fromDate: e.target.value })}
        />
      </div>

      <div className="grid w-full gap-2 md:w-[160px]">
        <Label htmlFor="audit-to">To</Label>
        <Input
          id="audit-to"
          type="date"
          value={filters.toDate ?? ""}
          onChange={(e) => patch({ toDate: e.target.value })}
        />
      </div>

      <div className="grid min-w-0 flex-1 gap-2 md:min-w-[240px]">
        <Label htmlFor="audit-trace">Trace ID</Label>
        <Input
          id="audit-trace"
          placeholder="Search trace ID…"
          value={traceDraft}
          onChange={(e) => setTraceDraft(e.target.value)}
        />
      </div>
    </div>
  )
}
