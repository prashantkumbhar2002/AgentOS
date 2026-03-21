/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react"
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useUsageStats } from "@/hooks/useAnalytics"

const COLORS: Record<string, string> = {
  autoApproved: "#22c55e",
  approved: "#3b82f6",
  denied: "#ef4444",
  expired: "#64748b",
}

export interface ApprovalPieChartProps {
  days: number
}

export function ApprovalPieChart({ days }: ApprovalPieChartProps) {
  const { data, isLoading } = useUsageStats({ days })

  const segments = useMemo(() => {
    const d = data as any
    const a = d?.approvals ?? d?.approvalBreakdown ?? d
    const entries = [
      { key: "autoApproved", name: "Auto-approved", value: Number(a?.autoApproved ?? a?.auto ?? 0) },
      { key: "approved", name: "Approved", value: Number(a?.approved ?? 0) },
      { key: "denied", name: "Denied", value: Number(a?.denied ?? 0) },
      { key: "expired", name: "Expired", value: Number(a?.expired ?? 0) },
    ].filter((e) => e.value > 0)
    return entries.map((e) => ({
      ...e,
      fill: COLORS[e.key] ?? "#71717a",
    }))
  }, [data])

  if (isLoading) {
    return <Skeleton className="h-[320px] w-full rounded-lg" />
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">Approvals</CardTitle>
      </CardHeader>
      <CardContent className="h-[280px] pt-0">
        {segments.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No approval data for this range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={segments}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={56}
                outerRadius={88}
                paddingAngle={2}
                stroke="#27272a"
              >
                {segments.map((s) => (
                  <Cell key={s.key} fill={s.fill} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  border: "1px solid #3f3f46",
                  borderRadius: 8,
                }}
                formatter={(value, _n, item) => [
                  `${Number(value ?? 0)}`,
                  (item as { payload?: { name?: string } })?.payload?.name ?? "",
                ]}
              />
              <Legend
                verticalAlign="bottom"
                formatter={(value, entry: any) => {
                  const v = entry?.payload?.value ?? ""
                  return `${value} (${v})`
                }}
                wrapperStyle={{ color: "#a1a1aa", fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
