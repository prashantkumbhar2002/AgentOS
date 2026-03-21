import { cn } from "@/lib/utils"

function barColor(score: number): string {
  if (score >= 80) return "bg-green-500"
  if (score >= 60) return "bg-yellow-500"
  if (score >= 40) return "bg-orange-500"
  return "bg-red-500"
}

export function HealthBar({ score }: { score: number }) {
  const clamped = Math.min(100, Math.max(0, score))
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className={cn("h-full rounded-full transition-all", barColor(clamped))}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
