import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDuration, formatUsd } from "@/lib/formatters"
import { cn } from "@/lib/utils"

type AgentStatsProps = {
  agent: any
  stats: any
}

function healthTextClass(score: number): string {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400"
  if (score >= 60) return "text-lime-600 dark:text-lime-400"
  if (score >= 40) return "text-amber-600 dark:text-amber-400"
  return "text-red-600 dark:text-red-400"
}

export function AgentStats({ agent, stats }: AgentStatsProps) {
  const totalRuns =
    stats?.totalTraces ??
    stats?.total_traces ??
    stats?.totalRuns ??
    stats?.runCount ??
    0
  const totalCost =
    typeof stats?.totalCostUsd === "number"
      ? stats.totalCostUsd
      : typeof stats?.total_cost_usd === "number"
        ? stats.total_cost_usd
        : typeof stats?.totalCost === "number"
          ? stats.totalCost
          : 0
  const avgLatency =
    typeof stats?.avgLatencyMs === "number"
      ? stats.avgLatencyMs
      : typeof stats?.avg_latency_ms === "number"
        ? stats.avg_latency_ms
        : typeof stats?.avgLatency === "number"
          ? stats.avgLatency
          : 0
  const health =
    typeof stats?.healthScore === "number"
      ? stats.healthScore
      : typeof stats?.health_score === "number"
        ? stats.health_score
        : typeof stats?.health === "number"
          ? stats.health
          : 0

  const items = [
    { title: "Total Runs", value: String(totalRuns) },
    { title: "Total Cost", value: formatUsd(totalCost) },
    { title: "Avg Latency", value: formatDuration(avgLatency) },
    {
      title: "Health Score",
      value: `${Math.round(health)}/100`,
      valueClass: healthTextClass(health),
    },
  ]

  return (
    <div key={agent?.id} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((it) => (
        <Card key={it.title}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">{it.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-2xl font-semibold tabular-nums", it.valueClass)}>{it.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
