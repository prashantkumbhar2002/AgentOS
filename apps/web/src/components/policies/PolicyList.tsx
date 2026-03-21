/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { usePolicyList } from "@/hooks/usePolicies"
import { cn } from "@/lib/utils"

function RiskBadge({ tier }: { tier?: string }) {
  const t = String(tier ?? "")
  return (
    <Badge variant="outline" className="font-mono text-[10px]">
      {t || "—"}
    </Badge>
  )
}

function effectBadge(effect: string | undefined) {
  const e = String(effect ?? "").toUpperCase()
  if (e === "ALLOW" || e === "ALLOWED") {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600">ALLOW</Badge>
  }
  if (e === "DENY" || e === "DENIED") {
    return <Badge variant="destructive">DENY</Badge>
  }
  if (e === "REQUIRE_APPROVAL" || e === "REQUIRE APPROVAL") {
    return <Badge className="bg-amber-600 hover:bg-amber-600">REQUIRE_APPROVAL</Badge>
  }
  return <Badge variant="secondary">{e || "—"}</Badge>
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[160px] items-center justify-center rounded-lg border border-dashed p-8 text-center text-muted-foreground">
      {message}
    </div>
  )
}

export function PolicyList() {
  const { data, isLoading } = usePolicyList()
  const [openId, setOpenId] = useState<string | null>(null)

  const policies = useMemo(() => {
    if (Array.isArray(data)) return data
    const d = data as any
    return d?.items ?? d?.data ?? d?.policies ?? []
  }, [data])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    )
  }

  if (!policies.length) {
    return <EmptyState message="No policies configured" />
  }

  return (
    <div className="space-y-4">
      {policies.map((p: any) => {
        const id = String(p?.id ?? p?.name ?? JSON.stringify(p))
        const expanded = openId === id
        const rules = p?.rules ?? []
        const ruleCount = Array.isArray(rules) ? rules.length : Number(p?.ruleCount ?? 0)
        return (
          <Card
            key={id}
            className={cn("cursor-pointer transition-colors", expanded && "border-primary/50")}
            onClick={() => setOpenId(expanded ? null : id)}
          >
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
              <div className="space-y-1">
                <CardTitle className="text-lg">{p?.name ?? "Untitled policy"}</CardTitle>
                <p className="text-sm text-muted-foreground">{p?.description ?? "—"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {p?.active !== false ? (
                  <Badge className="bg-emerald-600 hover:bg-emerald-600">Active</Badge>
                ) : (
                  <Badge variant="secondary">Inactive</Badge>
                )}
                <Badge variant="outline">{ruleCount} rules</Badge>
              </div>
            </CardHeader>
            {expanded && (
              <CardContent className="space-y-3 border-t pt-4" onClick={(e) => e.stopPropagation()}>
                {Array.isArray(rules) && rules.length > 0 ? (
                  rules.map((r: any, i: number) => (
                    <div
                      key={r?.id ?? i}
                      className="rounded-md border bg-muted/30 p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{r?.actionType ?? r?.action ?? "Rule"}</span>
                        {effectBadge(r?.effect)}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(r?.riskTiers ?? r?.tiers ?? []).map((t: string, j: number) => (
                          <RiskBadge key={`${i}-${j}`} tier={t} />
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No rules on this policy.</p>
                )}
              </CardContent>
            )}
          </Card>
        )
      })}
    </div>
  )
}
