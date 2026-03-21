import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const STYLES: Record<string, string> = {
  LOW: "border-transparent bg-green-500/20 text-green-400",
  MEDIUM: "border-transparent bg-yellow-500/20 text-yellow-400",
  HIGH: "border-transparent bg-orange-500/20 text-orange-400",
  CRITICAL: "border-transparent bg-red-500/20 text-red-400",
}

export function RiskBadge({ tier }: { tier: string }) {
  const key = tier.toUpperCase()
  return (
    <Badge className={cn(STYLES[key] ?? "border-transparent bg-muted text-muted-foreground")}>
      {tier}
    </Badge>
  )
}
