/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react"
import { differenceInSeconds } from "date-fns"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function riskBarColor(score: number | undefined): string {
  const s = score ?? 0
  if (s < 0.3) return "bg-emerald-500"
  if (s < 0.6) return "bg-yellow-500"
  if (s < 0.8) return "bg-orange-500"
  return "bg-red-500"
}

export interface ApprovalCardProps {
  ticket: any
  onApprove: () => void
  onDeny: () => void
}

export function ApprovalCard({ ticket, onApprove, onDeny }: ApprovalCardProps) {
  const [now, setNow] = useState(() => Date.now())
  const [showPayload, setShowPayload] = useState(false)

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const expiresAt = ticket?.expiresAt ? new Date(ticket.expiresAt) : null
  const secondsLeft = expiresAt ? differenceInSeconds(expiresAt, new Date(now)) : null
  const expired = secondsLeft !== null && secondsLeft <= 0
  const urgent =
    !expired &&
    expiresAt !== null &&
    differenceInSeconds(expiresAt, new Date(now)) < 5 * 60

  let countdownLabel = "—"
  if (!expiresAt) {
    countdownLabel = "—"
  } else if (expired) {
    countdownLabel = "Expired"
  } else {
    const total = Math.max(0, secondsLeft ?? 0)
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    if (h > 0) countdownLabel = `${h}h ${m}m ${s}s`
    else if (m > 0) countdownLabel = `${m}m ${s}s`
    else countdownLabel = `${s}s`
  }

  const risk = typeof ticket?.riskScore === "number" ? ticket.riskScore : Number(ticket?.riskScore) || 0
  const pct = Math.min(100, Math.max(0, risk <= 1 ? risk * 100 : risk))

  return (
    <Card
      className={cn(
        urgent && "animate-pulse ring-2 ring-red-500 ring-offset-2 ring-offset-background",
      )}
    >
      <CardHeader className="space-y-2 pb-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-bold">{ticket?.agentName ?? ticket?.agent?.name ?? "Unknown agent"}</span>
          <span className="text-sm text-muted-foreground">
            {ticket?.actionType ?? ticket?.action ?? "Action"}
          </span>
        </div>
        <div className="space-y-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all", riskBarColor(risk))}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">Risk score</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">{ticket?.reasoning ?? ticket?.reason ?? "—"}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Time remaining</span>
          <span className={cn("font-medium tabular-nums", expired && "text-destructive")}>
            {countdownLabel}
          </span>
        </div>
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowPayload((v) => !v)}>
            {showPayload ? "Hide Payload" : "Show Payload"}
          </Button>
          {showPayload && (
            <pre className="mt-2 max-h-48 overflow-auto rounded-md border bg-muted/40 p-3 text-xs">
              {JSON.stringify(ticket?.payload ?? {}, null, 2)}
            </pre>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button
          type="button"
          className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
          onClick={onApprove}
          disabled={expired}
        >
          Approve
        </Button>
        <Button type="button" variant="destructive" className="flex-1" onClick={onDeny} disabled={expired}>
          Deny
        </Button>
      </CardFooter>
    </Card>
  )
}
