/* eslint-disable @typescript-eslint/no-explicit-any */
// See AgentApprovalsTab.tsx for the rationale on `any` in this layer.
import { EmptyState } from "@/components/shared"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useAgent } from "@/hooks/useAgents"

type AgentPoliciesTabProps = {
  agentId: string
}

function ruleCount(p: any): number {
  if (typeof p.ruleCount === "number") return p.ruleCount
  if (typeof p.rule_count === "number") return p.rule_count
  const rules = p.rules
  return Array.isArray(rules) ? rules.length : 0
}

export function AgentPoliciesTab({ agentId }: AgentPoliciesTabProps) {
  const { data: agent, isPending } = useAgent(agentId)
  const policies = Array.isArray(agent?.policies) ? agent.policies : []

  if (isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    )
  }

  if (!policies.length) {
    return <EmptyState message="No policies assigned" />
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {policies.map((p: any, i: number) => (
        <Card key={p.id ?? p.name ?? i}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{p.name ?? "Policy"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">{p.description ?? "—"}</p>
            <p className="text-xs text-muted-foreground">{ruleCount(p)} rules</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
