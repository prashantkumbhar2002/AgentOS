import { useEffect, useState } from "react"
import { AlertTriangle, Check, Copy, Loader2, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { useRotateAgentApiKey } from "@/hooks/useAgents"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  agentId: string
  agentName: string
  hasExistingKey: boolean
  existingHint: string | null
}

export function RotateApiKeyDialog({
  open,
  onOpenChange,
  agentId,
  agentName,
  hasExistingKey,
  existingHint,
}: Props) {
  const { toast } = useToast()
  const rotate = useRotateAgentApiKey(agentId)
  const { reset: resetRotate } = rotate

  const [plaintext, setPlaintext] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Wipe the (possibly secret) plaintext API key from React state on close
  // so it cannot leak via a later re-open. This MUST happen on the falling
  // edge of `open`, not via `key`-based remount, because the parent decides
  // when to actually unmount us — leaving the secret in memory across opens
  // would be a real security regression.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) {
      setPlaintext(null)
      setHint(null)
      setCopied(false)
      resetRotate()
    }
  }, [open, resetRotate])
  /* eslint-enable react-hooks/set-state-in-effect */

  const onConfirm = async () => {
    try {
      const result = await rotate.mutateAsync()
      setPlaintext(result.apiKey)
      setHint(result.hint)
    } catch {
      // toast handled in hook
    }
  }

  const onCopy = async () => {
    if (!plaintext) return
    try {
      await navigator.clipboard.writeText(plaintext)
      setCopied(true)
      toast({ title: "API key copied to clipboard" })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ title: "Could not copy. Select and copy manually.", variant: "destructive" })
    }
  }

  const onClose = () => {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {plaintext ? (
          <>
            <DialogHeader>
              <DialogTitle>New API key for {agentName}</DialogTitle>
              <DialogDescription>
                This is the only time the key will be shown. Store it in a secret manager
                before closing this dialog.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="rounded-md border bg-muted/50 p-3 font-mono text-xs break-all">
                {plaintext}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Hint: <code className="font-mono">{hint}</code>
                </span>
                <Button type="button" size="sm" variant="outline" onClick={onCopy}>
                  {copied ? (
                    <>
                      <Check className="mr-2 size-4" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 size-4" /> Copy
                    </>
                  )}
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" onClick={onClose}>
                I&apos;ve stored it securely
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {hasExistingKey ? "Rotate API key" : "Generate API key"}
              </DialogTitle>
              <DialogDescription>
                {hasExistingKey
                  ? "Generating a new key immediately invalidates the existing one. Any agent processes still using the old key will start failing authentication."
                  : "This will mint the first API key for this agent. Pass it to the GovernanceClient SDK as `apiKey`."}
              </DialogDescription>
            </DialogHeader>

            {hasExistingKey && existingHint ? (
              <div className="rounded-md border border-amber-300/40 bg-amber-50/50 p-3 text-xs dark:border-amber-700/40 dark:bg-amber-900/10">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <div>
                    <div className="font-medium">Current key</div>
                    <code className="mt-0.5 block font-mono text-muted-foreground">
                      {existingHint}
                    </code>
                  </div>
                </div>
              </div>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={rotate.isPending}>
                Cancel
              </Button>
              <Button
                type="button"
                variant={hasExistingKey ? "destructive" : "default"}
                onClick={onConfirm}
                disabled={rotate.isPending}
              >
                {rotate.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 size-4" />
                )}
                {hasExistingKey ? "Rotate key" : "Generate key"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
