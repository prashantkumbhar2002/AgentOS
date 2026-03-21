import { useMemo, useState } from "react"
import { AgentFilterBar } from "@/components/agents/AgentFilterBar"
import { AgentTable } from "@/components/agents/AgentTable"
import { RegisterAgentModal } from "@/components/agents/RegisterAgentModal"
import { Button } from "@/components/ui/button"
import { useAgentList } from "@/hooks/useAgents"

function asAgentArray(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>
    if (Array.isArray(o.data)) return o.data
    if (Array.isArray(o.agents)) return o.agents
    if (Array.isArray(o.items)) return o.items
  }
  return []
}

function toQueryParams(filters: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (filters.status && filters.status !== "ALL") out.status = filters.status
  if (filters.riskTier && filters.riskTier !== "ALL") out.riskTier = filters.riskTier
  if (filters.environment && filters.environment !== "ALL") out.environment = filters.environment
  if (filters.ownerTeam?.trim()) out.ownerTeam = filters.ownerTeam.trim()
  if (filters.search?.trim()) out.search = filters.search.trim()
  return out
}

const defaultFilters: Record<string, string> = {
  status: "ALL",
  riskTier: "ALL",
  environment: "ALL",
  ownerTeam: "",
  search: "",
}

export function AgentsPage() {
  const [filters, setFilters] = useState(defaultFilters)
  const [registerOpen, setRegisterOpen] = useState(false)

  const params = useMemo(() => toQueryParams(filters), [filters])
  const { data, isPending } = useAgentList(params)
  const agents = useMemo(() => asAgentArray(data), [data])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Agent Registry</h1>
        <Button type="button" onClick={() => setRegisterOpen(true)}>
          Register Agent
        </Button>
      </div>
      <AgentFilterBar filters={filters} onChange={setFilters} />
      <AgentTable agents={agents} isLoading={isPending} />
      <RegisterAgentModal open={registerOpen} onClose={() => setRegisterOpen(false)} />
    </div>
  )
}
