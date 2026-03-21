import * as React from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function StatusBadge({ status }: { status?: string }) {
  const s = (status ?? "").toUpperCase() || "—"
  const cls =
    {
      DRAFT: "border-transparent bg-muted text-muted-foreground",
      ACTIVE: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
      SUSPENDED: "border-transparent bg-amber-500/15 text-amber-800 dark:text-amber-300",
      DEPRECATED: "border-transparent bg-slate-500/15 text-slate-700 dark:text-slate-300",
    }[s] ?? "border-transparent bg-secondary text-secondary-foreground"
  return <Badge className={cn("text-xs font-medium", cls)}>{s}</Badge>
}

export function RiskBadge({ tier }: { tier?: string }) {
  const t = (tier ?? "").toUpperCase() || "—"
  const cls =
    {
      LOW: "border-transparent bg-blue-500/15 text-blue-700 dark:text-blue-300",
      MEDIUM: "border-transparent bg-amber-500/15 text-amber-800 dark:text-amber-300",
      HIGH: "border-transparent bg-orange-500/15 text-orange-800 dark:text-orange-300",
      CRITICAL: "border-transparent bg-red-500/15 text-red-700 dark:text-red-400",
    }[t] ?? "border-transparent bg-secondary text-secondary-foreground"
  return <Badge className={cn("text-xs font-medium", cls)}>{t}</Badge>
}

export function HealthBar({ score }: { score?: number | null }) {
  const v = Math.min(100, Math.max(0, Number(score ?? 0)))
  const color =
    v >= 80 ? "bg-emerald-500" : v >= 60 ? "bg-lime-500" : v >= 40 ? "bg-amber-500" : "bg-red-500"
  return (
    <div className="h-2 w-full min-w-[4rem] overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${v}%` }} />
    </div>
  )
}

export function EmptyState({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-destructive/30 bg-destructive/5 py-16 text-center">
      <p className="text-sm text-destructive">{message}</p>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  )
}

export function EventBadge({ type }: { type?: string }) {
  const t = (type ?? "event").toLowerCase().replace(/_/g, " ")
  const cls =
    {
      "llm call": "bg-violet-500/15 text-violet-700 dark:text-violet-300",
      "tool call": "bg-sky-500/15 text-sky-800 dark:text-sky-300",
      error: "bg-red-500/15 text-red-700 dark:text-red-400",
      approval: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
    }[t] ?? "bg-muted text-muted-foreground"
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-transparent px-2 py-0.5 text-xs font-medium capitalize",
        cls,
      )}
    >
      {t}
    </span>
  )
}

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void | Promise<void>
  variant?: "default" | "destructive"
  children?: React.ReactNode
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  variant = "default",
  children,
}: ConfirmDialogProps) {
  const [loading, setLoading] = React.useState(false)
  const handleConfirm = async () => {
    setLoading(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            className={variant === "destructive" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            disabled={loading}
            onClick={(e) => {
              e.preventDefault()
              void handleConfirm()
            }}
          >
            {loading ? "…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
