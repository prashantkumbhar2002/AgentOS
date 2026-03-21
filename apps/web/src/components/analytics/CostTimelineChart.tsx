/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react"
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useCostTimeline } from "@/hooks/useAnalytics"
import { formatUsd } from "@/lib/formatters"

const STROKES = ["#22c55e", "#3b82f6", "#a855f7", "#f97316", "#eab308", "#ec4899", "#14b8a6"]

export interface CostTimelineChartProps {
  days: number
}

export function CostTimelineChart({ days }: CostTimelineChartProps) {
  const { data, isLoading } = useCostTimeline({ days })

  const { chartData, keys } = useMemo(() => {
    const raw = data as any
    const series = raw?.series ?? []
    const dateSet = new Set<string>()
    for (const s of series) {
      for (const p of s?.data ?? []) {
        if (p?.date) dateSet.add(String(p.date))
      }
    }
    const dates = [...dateSet].sort()
    const agentNames = series.map((s: any) => String(s?.agentName ?? "Agent"))
    const rows = dates.map((date) => {
      const row: Record<string, string | number> = { date }
      series.forEach((s: any, i: number) => {
        const name = String(s?.agentName ?? `series_${i}`)
        const pt = (s?.data ?? []).find((p: any) => String(p?.date) === date)
        row[name] = typeof pt?.cost === "number" ? pt.cost : 0
      })
      return row
    })
    return { chartData: rows, keys: agentNames }
  }, [data])

  if (isLoading) {
    return <Skeleton className="h-[320px] w-full rounded-lg" />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cost over time</CardTitle>
      </CardHeader>
      <CardContent className="h-[320px] pt-0">
        {chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No timeline data for this range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#3f3f46" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#3f3f46" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
              <YAxis
                stroke="#3f3f46"
                tick={{ fill: "#a1a1aa", fontSize: 11 }}
                tickFormatter={(v) => formatUsd(Number(v))}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  border: "1px solid #3f3f46",
                  borderRadius: 8,
                }}
                labelStyle={{ color: "#a1a1aa" }}
                formatter={(value) => formatUsd(Number(value ?? 0))}
              />
              <Legend wrapperStyle={{ color: "#a1a1aa", fontSize: 12 }} />
              {keys.map((name: string, i: number) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={STROKES[i % STROKES.length]}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
