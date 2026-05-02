import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const STATUS_OPTS = ["ALL", "DRAFT", "ACTIVE", "SUSPENDED", "DEPRECATED"] as const
const RISK_OPTS = ["ALL", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const
const ENV_OPTS = ["ALL", "DEV", "STAGING", "PROD"] as const

type AgentFilterBarProps = {
  filters: Record<string, string>
  onChange: (filters: Record<string, string>) => void
}

export function AgentFilterBar({ filters, onChange }: AgentFilterBarProps) {
  const [search, setSearch] = useState(filters.search ?? "")
  const filtersRef = useRef(filters)
  useEffect(() => {
    filtersRef.current = filters
  }, [filters])

  // Sync the locally-debounced `search` text when the controlled `filters.search`
  // value changes from the outside (e.g. parent clears all filters, or restores
  // a saved view). A `useEffect` is the right tool here: we're syncing internal
  // state to a prop that may change asynchronously. A `key`-based remount would
  // also work but would lose focus on the input mid-typing and break the debounce
  // timer below — strictly worse UX. The lint rule is suppressed locally because
  // this is the documented "controlled-prop sync" exception.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSearch(filters.search ?? "")
  }, [filters.search])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (search !== (filtersRef.current.search ?? "")) {
        onChange({ ...filtersRef.current, search })
      }
    }, 300)
    return () => window.clearTimeout(id)
  }, [search, onChange])

  const patch = (partial: Record<string, string>) => {
    onChange({ ...filters, ...partial })
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-[160px] space-y-1">
        <span className="text-xs text-muted-foreground">Status</span>
        <Select value={filters.status ?? "ALL"} onValueChange={(v) => patch({ status: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTS.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="w-[160px] space-y-1">
        <span className="text-xs text-muted-foreground">Risk tier</span>
        <Select value={filters.riskTier ?? "ALL"} onValueChange={(v) => patch({ riskTier: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Risk" />
          </SelectTrigger>
          <SelectContent>
            {RISK_OPTS.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="w-[160px] space-y-1">
        <span className="text-xs text-muted-foreground">Environment</span>
        <Select
          value={filters.environment ?? "ALL"}
          onValueChange={(v) => patch({ environment: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Environment" />
          </SelectTrigger>
          <SelectContent>
            {ENV_OPTS.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-[180px] flex-1 space-y-1">
        <span className="text-xs text-muted-foreground">Owner team</span>
        <Input
          placeholder="Team name"
          value={filters.ownerTeam ?? ""}
          onChange={(e) => patch({ ownerTeam: e.target.value })}
        />
      </div>
      <div className="min-w-[200px] flex-1 space-y-1">
        <span className="text-xs text-muted-foreground">Search</span>
        <Input
          placeholder="Search agents…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
    </div>
  )
}
