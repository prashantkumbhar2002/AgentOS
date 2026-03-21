/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react"
import { useApprovalList, useDecideApproval } from "@/hooks/useApprovals"
import { ApprovalCard } from "@/components/approvals/ApprovalCard"
import { ApprovalDecisionDialog } from "@/components/approvals/ApprovalDecisionDialog"
import { ResolvedTable } from "@/components/approvals/ResolvedTable"

function normalizeTickets(data: unknown): any[] {
  if (Array.isArray(data)) return data
  const d = data as any
  return d?.items ?? d?.data ?? d?.tickets ?? []
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed p-8 text-center text-muted-foreground">
      {message}
    </div>
  )
}

export function ApprovalsPage() {
  const { data, isLoading } = useApprovalList()
  const decide = useDecideApproval()

  const tickets = useMemo(() => normalizeTickets(data), [data])
  const pending = useMemo(
    () =>
      tickets
        .filter((t) => String(t?.status ?? "").toUpperCase() === "PENDING")
        .sort(
          (a, b) =>
            new Date(a?.expiresAt ?? 0).getTime() - new Date(b?.expiresAt ?? 0).getTime(),
        ),
    [tickets],
  )
  const resolved = useMemo(
    () => tickets.filter((t) => String(t?.status ?? "").toUpperCase() !== "PENDING"),
    [tickets],
  )

  const [dialogOpen, setDialogOpen] = useState(false)
  const [activeTicket, setActiveTicket] = useState<any>(null)
  const [decision, setDecision] = useState<"APPROVED" | "DENIED">("APPROVED")

  function openDialog(ticket: any, d: "APPROVED" | "DENIED") {
    setActiveTicket(ticket)
    setDecision(d)
    setDialogOpen(true)
  }

  async function handleConfirm(comment: string) {
    if (!activeTicket?.id) return
    await decide.mutateAsync({
      id: activeTicket.id,
      decision,
      comment: comment?.trim() ? comment : undefined,
    })
    setDialogOpen(false)
    setActiveTicket(null)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Approvals</h1>
        <p className="text-muted-foreground">Review and resolve agent action requests.</p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading approvals…</p>
          ) : pending.length === 0 ? (
            <EmptyState message="No pending approvals — agents are running smoothly" />
          ) : (
            pending.map((t) => (
              <ApprovalCard
                key={t?.id ?? JSON.stringify(t)}
                ticket={t}
                onApprove={() => openDialog(t, "APPROVED")}
                onDeny={() => openDialog(t, "DENIED")}
              />
            ))
          )}
        </div>

        <div className="w-full shrink-0 space-y-3 lg:w-[480px]">
          <h2 className="text-lg font-semibold">Resolved</h2>
          <ResolvedTable tickets={resolved} isLoading={isLoading} />
        </div>
      </div>

      <ApprovalDecisionDialog
        open={dialogOpen}
        ticket={activeTicket}
        decision={decision}
        loading={decide.isPending}
        onCancel={() => {
          setDialogOpen(false)
          setActiveTicket(null)
        }}
        onConfirm={handleConfirm}
      />
    </div>
  )
}
