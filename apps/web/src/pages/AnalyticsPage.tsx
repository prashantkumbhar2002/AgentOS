import { useState } from "react"
import { ApprovalPieChart } from "@/components/analytics/ApprovalPieChart"
import { CostSummaryCards } from "@/components/analytics/CostSummaryCards"
import { CostTimelineChart } from "@/components/analytics/CostTimelineChart"
import { LeaderboardTable } from "@/components/analytics/LeaderboardTable"
import { ModelUsageChart } from "@/components/analytics/ModelUsageChart"
import { Button } from "@/components/ui/button"

const RANGES = [7, 30, 90] as const

export function AnalyticsPage() {
  const [days, setDays] = useState<number>(7)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">Costs, approvals, and agent performance.</p>
        </div>
        <div className="flex gap-2">
          {RANGES.map((d) => (
            <Button
              key={d}
              type="button"
              size="sm"
              variant={days === d ? "default" : "outline"}
              onClick={() => setDays(d)}
            >
              {d}d
            </Button>
          ))}
        </div>
      </div>

      <CostSummaryCards days={days} />

      <CostTimelineChart days={days} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ApprovalPieChart days={days} />
        <ModelUsageChart days={days} />
      </div>

      <LeaderboardTable days={days} />
    </div>
  )
}
