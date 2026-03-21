import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import { EmptyState } from "@/components/shared/EmptyState"
import { HealthBar } from "@/components/shared/HealthBar"
import { RiskBadge } from "@/components/shared/RiskBadge"
import { StatusBadge } from "@/components/shared/StatusBadge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { useAgentList } from "@/hooks/useAgents"
import { formatRelativeTime, formatUsd } from "@/lib/formatters"
import { cn } from "@/lib/utils"

type DashboardAgent = {
  id: string
  name: string
  status: string
  riskTier: string
  ownerTeam?: string | null
  lastActiveAt?: string | Date | null
  cost7dUsd?: number
  cost7d?: number
  healthScore?: number
}

type SortKey = "name" | "status" | "riskTier" | "ownerTeam" | "lastActiveAt" | "cost7dUsd" | "healthScore"

function normalizeAgents(data: unknown): DashboardAgent[] {
  if (data == null) return []
  if (Array.isArray(data)) return data as DashboardAgent[]
  if (typeof data === "object" && "data" in data && Array.isArray((data as { data: unknown }).data)) {
    return (data as { data: DashboardAgent[] }).data
  }
  return []
}

function healthScore(agent: DashboardAgent): number {
  if (typeof agent.healthScore === "number") return agent.healthScore
  return 70
}

function cost7d(agent: DashboardAgent): number {
  if (typeof agent.cost7dUsd === "number") return agent.cost7dUsd
  if (typeof agent.cost7d === "number") return agent.cost7d
  return 0
}

export function AgentHealthTable() {
  const navigate = useNavigate()
  const { data, isPending } = useAgentList({ limit: 100 })
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  const rows = useMemo(() => normalizeAgents(data), [data])

  const sorted = useMemo(() => {
    const next = [...rows]
    const dir = sortDir === "asc" ? 1 : -1
    next.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name) * dir
        case "status":
          return a.status.localeCompare(b.status) * dir
        case "riskTier":
          return a.riskTier.localeCompare(b.riskTier) * dir
        case "ownerTeam":
          return (a.ownerTeam ?? "").localeCompare(b.ownerTeam ?? "") * dir
        case "lastActiveAt": {
          const ta = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0
          const tb = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0
          return (ta - tb) * dir
        }
        case "cost7dUsd":
          return (cost7d(a) - cost7d(b)) * dir
        case "healthScore":
          return (healthScore(a) - healthScore(b)) * dir
        default:
          return 0
      }
    })
    return next
  }, [rows, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  if (isPending) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {["Name", "Status", "Risk", "Owner", "Last Active", "7d Cost", "Health"].map((h) => (
                <TableHead key={h}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 7 }).map((__, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full max-w-[120px]" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  if (sorted.length === 0) {
    return (
      <EmptyState
        title="No agents yet"
        description="Register an agent to see health, cost, and status here."
      />
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead
              className="cursor-pointer select-none"
              onClick={() => toggleSort("name")}
            >
              Name
            </TableHead>
            <TableHead
              className="cursor-pointer select-none"
              onClick={() => toggleSort("status")}
            >
              Status
            </TableHead>
            <TableHead
              className="cursor-pointer select-none"
              onClick={() => toggleSort("riskTier")}
            >
              Risk
            </TableHead>
            <TableHead
              className="cursor-pointer select-none"
              onClick={() => toggleSort("ownerTeam")}
            >
              Owner
            </TableHead>
            <TableHead
              className="cursor-pointer select-none"
              onClick={() => toggleSort("lastActiveAt")}
            >
              Last Active
            </TableHead>
            <TableHead
              className="cursor-pointer select-none"
              onClick={() => toggleSort("cost7dUsd")}
            >
              7d Cost
            </TableHead>
            <TableHead
              className="cursor-pointer select-none"
              onClick={() => toggleSort("healthScore")}
            >
              Health
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((agent) => (
            <TableRow
              key={agent.id}
              className="cursor-pointer"
              onClick={() => navigate(`/agents/${agent.id}`)}
            >
              <TableCell className={cn("font-medium text-primary underline-offset-4 hover:underline")}>
                {agent.name}
              </TableCell>
              <TableCell>
                <StatusBadge status={agent.status} />
              </TableCell>
              <TableCell>
                <RiskBadge tier={agent.riskTier} />
              </TableCell>
              <TableCell>{agent.ownerTeam ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">
                {agent.lastActiveAt ? formatRelativeTime(agent.lastActiveAt) : "—"}
              </TableCell>
              <TableCell>{formatUsd(cost7d(agent))}</TableCell>
              <TableCell className="min-w-[120px]">
                <HealthBar score={healthScore(agent)} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
