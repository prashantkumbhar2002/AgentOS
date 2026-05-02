/* eslint-disable @typescript-eslint/no-explicit-any */
// See AgentApprovalsTab.tsx for the rationale on `any` in this layer.
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { EmptyState, HealthBar, RiskBadge, StatusBadge } from "@/components/shared"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatRelativeTime, formatUsd } from "@/lib/formatters"

type SortKey =
  | "name"
  | "status"
  | "riskTier"
  | "ownerTeam"
  | "tools"
  | "lastActiveAt"
  | "cost7d"
  | "healthScore"

type AgentTableProps = {
  agents: any[]
  isLoading: boolean
}

function toolsCount(a: any): number {
  const t = a.tools ?? a.toolList
  return Array.isArray(t) ? t.length : typeof t === "number" ? t : 0
}

function lastActive(a: any): string | undefined {
  return a.lastActiveAt ?? a.last_active_at ?? a.lastActive
}

function cost7d(a: any): number {
  const v = a.cost7d ?? a.cost7D ?? a.sevenDayCost ?? a.cost_7d
  return typeof v === "number" ? v : 0
}

function healthScore(a: any): number {
  const v = a.healthScore ?? a.health_score ?? a.health
  return typeof v === "number" ? v : 0
}

function compare(a: any, b: any, key: SortKey, dir: number): number {
  const mul = dir
  switch (key) {
    case "name":
      return mul * String(a.name ?? "").localeCompare(String(b.name ?? ""))
    case "status":
      return mul * String(a.status ?? "").localeCompare(String(b.status ?? ""))
    case "riskTier":
      return mul * String(a.riskTier ?? a.risk_tier ?? "").localeCompare(
        String(b.riskTier ?? b.risk_tier ?? ""),
      )
    case "ownerTeam":
      return mul * String(a.ownerTeam ?? a.owner_team ?? "").localeCompare(
        String(b.ownerTeam ?? b.owner_team ?? ""),
      )
    case "tools":
      return mul * (toolsCount(a) - toolsCount(b))
    case "lastActiveAt": {
      const ta = lastActive(a) ? new Date(lastActive(a)!).getTime() : 0
      const tb = lastActive(b) ? new Date(lastActive(b)!).getTime() : 0
      return mul * (ta - tb)
    }
    case "cost7d":
      return mul * (cost7d(a) - cost7d(b))
    case "healthScore":
      return mul * (healthScore(a) - healthScore(b))
    default:
      return 0
  }
}

export function AgentTable({ agents, isLoading }: AgentTableProps) {
  const navigate = useNavigate()
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDir, setSortDir] = useState<1 | -1>(1)

  const sorted = useMemo(() => {
    const copy = [...agents]
    copy.sort((a, b) => compare(a, b, sortKey, sortDir))
    return copy
  }, [agents, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1))
    else {
      setSortKey(key)
      setSortDir(1)
    }
  }

  const head = (key: SortKey, label: string) => (
    <TableHead
      className="cursor-pointer select-none hover:text-foreground"
      onClick={() => toggleSort(key)}
    >
      {label}
      {sortKey === key ? (sortDir === 1 ? " ↑" : " ↓") : ""}
    </TableHead>
  )

  if (isLoading) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Tools</TableHead>
              <TableHead>Last Active</TableHead>
              <TableHead>7d Cost</TableHead>
              <TableHead>Health</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 8 }).map((__, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  if (!sorted.length) {
    return <EmptyState message="No agents match your filters" />
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {head("name", "Name")}
            {head("status", "Status")}
            {head("riskTier", "Risk")}
            {head("ownerTeam", "Owner")}
            {head("tools", "Tools")}
            {head("lastActiveAt", "Last Active")}
            {head("cost7d", "7d Cost")}
            {head("healthScore", "Health")}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((a) => {
            const id = a.id ?? a.agentId
            const la = lastActive(a)
            return (
              <TableRow
                key={id}
                className="cursor-pointer"
                onClick={() => navigate(`/agents/${id}`)}
              >
                <TableCell className="font-medium">{a.name ?? "—"}</TableCell>
                <TableCell>
                  <StatusBadge status={a.status} />
                </TableCell>
                <TableCell>
                  <RiskBadge tier={a.riskTier ?? a.risk_tier} />
                </TableCell>
                <TableCell>{a.ownerTeam ?? a.owner_team ?? "—"}</TableCell>
                <TableCell>{toolsCount(a)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {la ? formatRelativeTime(la) : "—"}
                </TableCell>
                <TableCell>{formatUsd(cost7d(a))}</TableCell>
                <TableCell className="max-w-[140px]">
                  <HealthBar score={healthScore(a)} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
