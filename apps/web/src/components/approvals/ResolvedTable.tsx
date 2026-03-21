/* eslint-disable @typescript-eslint/no-explicit-any */
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatRelativeTime } from "@/lib/formatters"

function statusBadge(status: string | undefined) {
  const s = String(status ?? "").toUpperCase()
  if (s === "APPROVED") {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600">APPROVED</Badge>
  }
  if (s === "DENIED") {
    return <Badge variant="destructive">DENIED</Badge>
  }
  if (s === "EXPIRED") {
    return <Badge className="bg-slate-600 text-white hover:bg-slate-600">EXPIRED</Badge>
  }
  return <Badge variant="outline">{s || "—"}</Badge>
}

export interface ResolvedTableProps {
  tickets: any[]
  isLoading: boolean
}

export function ResolvedTable({ tickets, isLoading }: ResolvedTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2 rounded-lg border p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    )
  }

  if (!tickets?.length) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No resolved tickets yet.
      </div>
    )
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Agent</TableHead>
            <TableHead>Action Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Resolved By</TableHead>
            <TableHead>Resolved At</TableHead>
            <TableHead className="text-right">Risk Score</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map((t) => (
            <TableRow key={t?.id ?? JSON.stringify(t)}>
              <TableCell className="font-medium">{t?.agentName ?? t?.agent?.name ?? "—"}</TableCell>
              <TableCell>{t?.actionType ?? t?.action ?? "—"}</TableCell>
              <TableCell>{statusBadge(t?.status)}</TableCell>
              <TableCell>{t?.resolvedBy?.name ?? t?.resolvedByName ?? t?.resolvedBy ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {t?.resolvedAt ? formatRelativeTime(t.resolvedAt) : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {typeof t?.riskScore === "number" ? t.riskScore.toFixed(2) : t?.riskScore ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
