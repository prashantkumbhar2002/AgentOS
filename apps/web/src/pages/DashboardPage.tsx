import { AgentHealthTable } from "@/components/dashboard/AgentHealthTable"
import { DashboardStats } from "@/components/dashboard/DashboardStats"
import { LiveActivityFeed } from "@/components/dashboard/LiveActivityFeed"

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Overview of agents, spend, and live activity.</p>
      </div>
      <DashboardStats />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 min-w-0">
          <h2 className="mb-3 text-lg font-semibold">Agent health</h2>
          <AgentHealthTable />
        </div>
        <div className="lg:col-span-2 min-w-0">
          <h2 className="mb-3 text-lg font-semibold">Live activity</h2>
          <LiveActivityFeed />
        </div>
      </div>
    </div>
  )
}
