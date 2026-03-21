/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAgentLeaderboard } from "@/hooks/useAnalytics"
import { formatDuration, formatUsd } from "@/lib/formatters"
import { cn } from "@/lib/utils"

type SortKey = "cost" | "runs" | "errorRate" | "latency" | "health" | "name"
type Dir = "asc" | "desc"

function HealthBar({ value }: { value?: number }) {
  const raw = typeof value === "number" ? value : Number(value)
  const v = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw <= 1 ? raw * 100 : raw)) : 0
  let color = "bg-emerald-500"
  if (v < 40) color = "bg-red-500"
  else if (v < 70) color = "bg-amber-500"
  return (
    <div className="h-2 w-full max-w-[140px] overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${v}%` }} />
    </div>
  )
}

export interface LeaderboardTableProps {
  days: number
}

export function LeaderboardTable({ days }: LeaderboardTableProps) {
  const { data, isLoading } = useAgentLeaderboard({ days })
  const [sortKey, setSortKey] = useState<SortKey>("cost")
  const [dir, setDir] = useState<Dir>("desc")

  const rows = useMemo(() => {
    const d = data as any
    const list = Array.isArray(d) ? d : d?.agents ?? d?.items ?? d?.data ?? []
    return (list as any[]).map((a, i) => ({
      rank: i + 1,
      name: String(a?.agentName ?? a?.name ?? a?.id ?? "—"),
      cost: Number(a?.totalCost ?? a?.costUsd ?? 0),
      runs: Number(a?.runs ?? a?.runCount ?? 0),
      errorRate: Number(a?.errorRate ?? a?.errorsPct ?? 0),
      latency: Number(a?.avgLatency ?? a?.avgLatencyMs ?? 0),
      health: Number(a?.health ?? a?.healthScore ?? a?.score ?? 0),
    }))
  }, [data])

  const sorted = useMemo(() => {
    const mult = dir === "asc" ? 1 : -1
    const copy = [...rows]
    copy.sort((a, b) => {
      if (sortKey === "name") return mult * a.name.localeCompare(b.name)
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av === bv) return a.name.localeCompare(b.name)
      return mult * (av < bv ? -1 : 1)
    })
    return copy.map((r, i) => ({ ...r, rank: i + 1 }))
  }, [rows, sortKey, dir])

  function toggle(key: SortKey) {
    if (sortKey === key) setDir((d) => (d === "asc" ? "desc" : "asc"))
    else {
      setSortKey(key)
      setDir(key === "name" ? "asc" : "desc")
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agent leaderboard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Agent leaderboard</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">#</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggle("name")}>
                Agent {sortKey === "name" ? (dir === "asc" ? "↑" : "↓") : ""}
              </TableHead>
              <TableHead className="cursor-pointer text-right select-none" onClick={() => toggle("cost")}>
                Total cost {sortKey === "cost" ? (dir === "asc" ? "↑" : "↓") : ""}
              </TableHead>
              <TableHead className="cursor-pointer text-right select-none" onClick={() => toggle("runs")}>
                Runs {sortKey === "runs" ? (dir === "asc" ? "↑" : "↓") : ""}
              </TableHead>
              <TableHead className="cursor-pointer text-right select-none" onClick={() => toggle("errorRate")}>
                Error rate {sortKey === "errorRate" ? (dir === "asc" ? "↑" : "↓") : ""}
              </TableHead>
              <TableHead className="cursor-pointer text-right select-none" onClick={() => toggle("latency")}>
                Avg latency {sortKey === "latency" ? (dir === "asc" ? "↑" : "↓") : ""}
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggle("health")}>
                Health {sortKey === "health" ? (dir === "asc" ? "↑" : "↓") : ""}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No agents in this period.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((r) => (
                <TableRow key={r.name}>
                  <TableCell className="tabular-nums text-muted-foreground">{r.rank}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatUsd(r.cost)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.runs}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.errorRate.toFixed(1)}%</TableCell>
                  <TableCell className="text-right tabular-nums">{formatDuration(r.latency)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <HealthBar value={r.health} />
                      <Badge variant="outline" className="tabular-nums text-[10px]">
                        {r.health <= 1 ? Math.round(r.health * 100) : Math.round(r.health)}
                      </Badge>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
