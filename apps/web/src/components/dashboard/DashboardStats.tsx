import { Activity, Bot, DollarSign, ShieldCheck } from "lucide-react"

import { StatCard } from "@/components/shared/StatCard"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useAgentList } from "@/hooks/useAgents"
import { useApprovalList } from "@/hooks/useApprovals"
import { useCostSummary } from "@/hooks/useAnalytics"
import { formatUsd } from "@/lib/formatters"

function readTotal(payload: unknown): number {
  if (payload == null || typeof payload !== "object") return 0
  const t = (payload as { total?: unknown }).total
  return typeof t === "number" ? t : 0
}

function readPendingCount(payload: unknown): number {
  if (payload == null || typeof payload !== "object") return 0
  const o = payload as { pendingCount?: unknown; total?: unknown }
  if (typeof o.pendingCount === "number") return o.pendingCount
  return typeof o.total === "number" ? o.total : 0
}

function readTodayUsd(payload: unknown): number {
  if (payload == null || typeof payload !== "object") return 0
  const v = (payload as { todayUsd?: unknown }).todayUsd
  return typeof v === "number" ? v : 0
}

export function DashboardStats() {
  const agentsAll = useAgentList({ limit: 1 })
  const agentsActive = useAgentList({ status: "ACTIVE", limit: 1 })
  const approvals = useApprovalList({ status: "PENDING", limit: 1 })
  const costs = useCostSummary()

  const loading =
    agentsAll.isPending || agentsActive.isPending || approvals.isPending || costs.isPending

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="size-4 rounded-md" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const totalAgents = readTotal(agentsAll.data)
  const activeAgents = readTotal(agentsActive.data)
  const pendingApprovals = readPendingCount(approvals.data)
  const todayCost = readTodayUsd(costs.data)

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatCard title="Total Agents" value={totalAgents} icon={<Bot className="size-4" />} />
      <StatCard title="Active Agents" value={activeAgents} icon={<Activity className="size-4" />} />
      <StatCard
        title="Pending Approvals"
        value={pendingApprovals}
        icon={<ShieldCheck className="size-4" />}
        pulse={pendingApprovals > 0}
      />
      <StatCard
        title="Today's Cost"
        value={formatUsd(todayCost)}
        icon={<DollarSign className="size-4" />}
      />
    </div>
  )
}
