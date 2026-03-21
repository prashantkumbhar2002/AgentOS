import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type AgentOverviewTabProps = {
  agent: any
}

export function AgentOverviewTab({ agent }: AgentOverviewTabProps) {
  const tools = Array.isArray(agent?.tools) ? agent.tools : []
  const policies = Array.isArray(agent?.policies) ? agent.policies : []

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight">Tools</h2>
        {tools.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tools configured.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {tools.map((t: any, i: number) => (
              <Card key={t.id ?? t.name ?? i}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{t.name ?? "Unnamed tool"}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{t.description ?? "—"}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
      {policies.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold tracking-tight">Policies</h2>
          <ul className="space-y-2 text-sm">
            {policies.map((p: any, i: number) => (
              <li key={p.id ?? p.name ?? i} className="rounded-md border px-3 py-2">
                <span className="font-medium">{p.name ?? "Policy"}</span>
                {p.description ? (
                  <p className="text-muted-foreground">{p.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
