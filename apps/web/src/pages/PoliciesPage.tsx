import { PolicyList } from "@/components/policies/PolicyList"

export function PoliciesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Policies</h1>
        <p className="text-muted-foreground">
          Organization guardrails for agent actions. This view is read-only.
        </p>
      </div>
      <PolicyList />
    </div>
  )
}
