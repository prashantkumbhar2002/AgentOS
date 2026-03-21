import {
  CheckCircle,
  Clock,
  Sparkles,
  Wrench,
  XCircle,
  type LucideIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const CONFIG: Record<string, { className: string; icon: LucideIcon; label: string }> = {
  llm_call: {
    className: "border-transparent bg-blue-500/20 text-blue-400",
    icon: Sparkles,
    label: "LLM call",
  },
  tool_call: {
    className: "border-transparent bg-violet-500/20 text-violet-400",
    icon: Wrench,
    label: "Tool call",
  },
  approval_requested: {
    className: "border-transparent bg-orange-500/20 text-orange-400",
    icon: Clock,
    label: "Approval requested",
  },
  approval_resolved: {
    className: "border-transparent bg-green-500/20 text-green-400",
    icon: CheckCircle,
    label: "Approval resolved",
  },
  action_blocked: {
    className: "border-transparent bg-red-500/20 text-red-400",
    icon: XCircle,
    label: "Action blocked",
  },
}

export function EventBadge({ type }: { type: string }) {
  const cfg = CONFIG[type] ?? {
    className: "border-transparent bg-muted text-muted-foreground",
    icon: Sparkles,
    label: type.replace(/_/g, " "),
  }
  const Icon = cfg.icon
  return (
    <Badge className={cn("gap-1", cfg.className)}>
      <Icon className="size-3 shrink-0" />
      {cfg.label}
    </Badge>
  )
}
