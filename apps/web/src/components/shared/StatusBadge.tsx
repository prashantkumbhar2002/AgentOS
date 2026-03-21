import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const STYLES: Record<string, string> = {
  DRAFT: "border-transparent bg-slate-500/20 text-slate-400",
  PENDING_APPROVAL: "border-transparent bg-blue-500/20 text-blue-400",
  APPROVED: "border-transparent bg-blue-500/20 text-blue-400",
  ACTIVE: "border-transparent bg-green-500/20 text-green-400",
  SUSPENDED: "border-transparent bg-amber-500/20 text-amber-400",
  DEPRECATED: "border-transparent bg-red-500/20 text-red-400",
}

function formatStatusLabel(status: string) {
  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function StatusBadge({ status }: { status: string }) {
  const key = status.toUpperCase()
  return (
    <Badge className={cn(STYLES[key] ?? "border-transparent bg-muted text-muted-foreground")}>
      {formatStatusLabel(status)}
    </Badge>
  )
}
