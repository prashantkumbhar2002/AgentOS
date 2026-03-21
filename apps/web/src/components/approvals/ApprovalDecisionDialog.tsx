/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
import { useEffect, useState } from "react"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

export interface ApprovalDecisionDialogProps {
  open: boolean
  ticket: any
  decision: "APPROVED" | "DENIED"
  onConfirm: (comment: string) => void
  onCancel: () => void
  loading?: boolean
}

export function ApprovalDecisionDialog({
  open,
  ticket,
  decision,
  onConfirm,
  onCancel,
  loading,
}: ApprovalDecisionDialogProps) {
  const [comment, setComment] = useState("")

  useEffect(() => {
    if (open) setComment("")
  }, [open, ticket?.id])

  const payloadJson = JSON.stringify(ticket?.payload ?? ticket ?? {}, null, 2)
  const isDenied = decision === "DENIED"

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{isDenied ? "Deny approval" : "Approve action"}</AlertDialogTitle>
          <AlertDialogDescription>
            Review the payload and add an optional comment before confirming.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <pre className="max-h-48 overflow-auto rounded-md border bg-muted/50 p-3 text-xs">{payloadJson}</pre>
        <div className="space-y-2">
          <label htmlFor="approval-comment" className="text-sm font-medium">
            Comment
          </label>
          <Textarea
            id="approval-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional note for the audit log"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel type="button" disabled={loading} onClick={onCancel}>
            Cancel
          </AlertDialogCancel>
          <Button
            type="button"
            variant={isDenied ? "destructive" : "default"}
            className={!isDenied ? "bg-emerald-600 hover:bg-emerald-700" : undefined}
            disabled={loading}
            onClick={() => onConfirm(comment)}
          >
            {loading ? "Submitting…" : isDenied ? "Confirm deny" : "Confirm approve"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
