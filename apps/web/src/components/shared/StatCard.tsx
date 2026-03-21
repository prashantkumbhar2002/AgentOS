import type { ReactNode } from "react"
import { ArrowDown, ArrowUp } from "lucide-react"

import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function StatCard({
  title,
  value,
  icon,
  trend,
  pulse,
  className,
}: {
  title: string
  value: string | number
  icon: ReactNode
  trend?: { value: number; isPositive: boolean }
  pulse?: boolean
  className?: string
}) {
  return (
    <Card className={cn(className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          {pulse && (
            <span
              className="size-2 shrink-0 rounded-full bg-primary animate-pulse"
              aria-hidden
            />
          )}
          {title}
        </div>
        <div className="text-muted-foreground [&_svg]:size-4">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        {trend !== undefined && (
          <p
            className={cn(
              "mt-1 flex items-center gap-1 text-xs font-medium",
              trend.isPositive ? "text-green-500" : "text-red-500",
            )}
          >
            {trend.isPositive ? (
              <ArrowUp className="size-3" />
            ) : (
              <ArrowDown className="size-3" />
            )}
            {Math.abs(trend.value)}%
          </p>
        )}
      </CardContent>
    </Card>
  )
}
