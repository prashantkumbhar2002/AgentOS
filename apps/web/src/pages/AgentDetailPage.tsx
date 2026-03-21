import axios from "axios"
import { useMemo } from "react"
import { useParams, useSearchParams } from "react-router-dom"
import { AgentApprovalsTab } from "@/components/agents/AgentApprovalsTab"
import { AgentHeader } from "@/components/agents/AgentHeader"
import { AgentOverviewTab } from "@/components/agents/AgentOverviewTab"
import { AgentPoliciesTab } from "@/components/agents/AgentPoliciesTab"
import { AgentSettingsTab } from "@/components/agents/AgentSettingsTab"
import { AgentStats } from "@/components/agents/AgentStats"
import { AgentTracesTab } from "@/components/agents/AgentTracesTab"
import { ErrorState } from "@/components/shared"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAgent } from "@/hooks/useAgents"
import { useAgentAuditStats } from "@/hooks/useAuditLogs"
import { useAuthStore } from "@/store/useAuthStore"

const TAB_KEYS = ["overview", "traces", "approvals", "policies", "settings"] as const

export function AgentDetailPage() {
  const { id = "" } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const role = useAuthStore((s) => s.user?.role)
  const isAdmin = role === "admin"

  const tabRaw = searchParams.get("tab") ?? "overview"
  const tab = TAB_KEYS.includes(tabRaw as (typeof TAB_KEYS)[number])
    ? tabRaw
    : "overview"

  const setTab = (v: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set("tab", v)
      return next
    })
  }

  const { data: agent, isPending: agentLoading, isError, error, refetch } = useAgent(id)
  const { data: stats, isPending: statsLoading } = useAgentAuditStats(id)

  const notFound = useMemo(() => {
    if (!isError || !axios.isAxiosError(error)) return false
    return error.response?.status === 404
  }, [isError, error])

  if (!id) {
    return <ErrorState message="Missing agent id." />
  }

  if (agentLoading) {
    return (
      <div className="space-y-8">
        <div className="space-y-3">
          <Skeleton className="h-9 w-64" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-20" />
          </div>
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (isError && notFound) {
    return <ErrorState message="Agent not found." onRetry={() => refetch()} />
  }

  if (isError) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : "Failed to load agent."}
        onRetry={() => refetch()}
      />
    )
  }

  if (!agent) {
    return <ErrorState message="Agent not found." onRetry={() => refetch()} />
  }

  const effectiveTab = tab === "settings" && !isAdmin ? "overview" : tab

  return (
    <div className="space-y-8">
      <AgentHeader agent={agent} />
      {statsLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <AgentStats agent={agent} stats={stats} />
      )}
      <Tabs value={effectiveTab} onValueChange={setTab}>
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="traces">Audit Traces</TabsTrigger>
          <TabsTrigger value="approvals">Approvals</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          {isAdmin ? <TabsTrigger value="settings">Settings</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="overview">
          <AgentOverviewTab agent={agent} />
        </TabsContent>
        <TabsContent value="traces">
          <AgentTracesTab agentId={id} />
        </TabsContent>
        <TabsContent value="approvals">
          <AgentApprovalsTab agentId={id} />
        </TabsContent>
        <TabsContent value="policies">
          <AgentPoliciesTab agentId={id} />
        </TabsContent>
        {isAdmin ? (
          <TabsContent value="settings">
            <AgentSettingsTab agent={agent} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  )
}
