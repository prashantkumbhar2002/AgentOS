/* eslint-disable @typescript-eslint/no-explicit-any */
// See AgentApprovalsTab.tsx for the rationale on `any` in this layer.
import { useNavigate } from "react-router-dom"
import { RiskBadge, StatusBadge } from "@/components/shared"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/store/useAuthStore"

type AgentHeaderProps = {
  agent: any
}

export function AgentHeader({ agent }: AgentHeaderProps) {
  const navigate = useNavigate()
  const role = useAuthStore((s) => s.user?.role)
  const id = agent?.id ?? agent?.agentId
  const env = (agent?.environment ?? agent?.env ?? "").toString().toUpperCase()

  return (
    <div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">{agent?.name ?? "Agent"}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={agent?.status} />
          <RiskBadge tier={agent?.riskTier ?? agent?.risk_tier} />
          {env ? (
            <Badge variant="outline" className="text-xs uppercase">
              {env}
            </Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          Owner: <span className="text-foreground">{agent?.ownerTeam ?? agent?.owner_team ?? "—"}</span>
        </p>
      </div>
      {role === "admin" ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => id && navigate(`/agents/${id}?tab=settings`)}
        >
          Edit
        </Button>
      ) : null}
    </div>
  )
}
