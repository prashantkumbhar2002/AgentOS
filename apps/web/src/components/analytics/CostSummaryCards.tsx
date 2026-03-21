/* eslint-disable @typescript-eslint/no-explicit-any */
import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useCostSummary } from "@/hooks/useAnalytics"
import { formatUsd } from "@/lib/formatters"
import { cn } from "@/lib/utils"

export interface CostSummaryCardsProps {
  days: number
}

export function CostSummaryCards({ days }: CostSummaryCardsProps) {
  const { data, isLoading } = useCostSummary({ days })

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    )
  }

  const d = data as any
  const today = typeof d?.todayUsd === "number" ? d.todayUsd : 0
  const periodUsd =
    days <= 7
      ? (typeof d?.last7dUsd === "number" ? d.last7dUsd : d?.periodUsd ?? 0)
      : days <= 30
        ? (typeof d?.last30dUsd === "number" ? d.last30dUsd : d?.periodUsd ?? 0)
        : (typeof d?.last90dUsd === "number" ? d.last90dUsd : d?.last30dUsd ?? d?.periodUsd ?? 0)

  const change = typeof d?.changeVs7dAgo === "number" ? d.changeVs7dAgo : 0
  const up = change >= 0

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Today</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tabular-nums">{formatUsd(today)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">This period</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tabular-nums">{formatUsd(periodUsd)}</p>
          <p className="text-xs text-muted-foreground">
            {days <= 7 ? "Last 7 days" : days <= 30 ? "Last 30 days" : "Last 90 days"}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">vs last period</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <p className={cn("text-2xl font-bold tabular-nums", up ? "text-red-400" : "text-emerald-400")}>
              {up ? "+" : ""}
              {change.toFixed(1)}%
            </p>
            {up ? (
              <ArrowUpRight className="h-5 w-5 text-red-400" aria-hidden />
            ) : (
              <ArrowDownRight className="h-5 w-5 text-emerald-400" aria-hidden />
            )}
          </div>
          <p className="text-xs text-muted-foreground">Change vs 7 days ago baseline</p>
        </CardContent>
      </Card>
    </div>
  )
}
