/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useModelUsage } from "@/hooks/useAnalytics"

export interface ModelUsageChartProps {
  days: number
}

export function ModelUsageChart({ days }: ModelUsageChartProps) {
  const { data, isLoading } = useModelUsage({ days })

  const rows = useMemo(() => {
    const d = data as any
    const list = d?.models ?? d?.items ?? (Array.isArray(d) ? d : [])
    return (list as any[]).map((m) => ({
      name: String(m?.model ?? m?.name ?? m?.id ?? "—"),
      calls: Number(m?.calls ?? m?.count ?? m?.totalCalls ?? 0),
    }))
  }, [data])

  if (isLoading) {
    return <Skeleton className="h-[320px] w-full rounded-lg" />
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">Model usage</CardTitle>
      </CardHeader>
      <CardContent className="h-[280px] pt-0">
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No model usage for this range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 32 }}>
              <CartesianGrid stroke="#3f3f46" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="name"
                stroke="#3f3f46"
                tick={{ fill: "#a1a1aa", fontSize: 10 }}
                interval={0}
                angle={-24}
                textAnchor="end"
                height={72}
              />
              <YAxis stroke="#3f3f46" tick={{ fill: "#a1a1aa", fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  border: "1px solid #3f3f46",
                  borderRadius: 8,
                }}
                labelStyle={{ color: "#a1a1aa" }}
              />
              <Bar dataKey="calls" fill="#3b82f6" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
