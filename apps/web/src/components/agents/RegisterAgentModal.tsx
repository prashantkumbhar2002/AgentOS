import { useEffect, useState } from "react"
import { useCreateAgent } from "@/hooks/useAgents"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { Trash2 } from "lucide-react"

type ToolRow = { name: string; description: string }

const RISK_OPTS = [
  { value: "LOW", label: "Low", hint: "Limited blast radius" },
  { value: "MEDIUM", label: "Medium", hint: "Moderate operational impact" },
  { value: "HIGH", label: "High", hint: "Significant business impact" },
  { value: "CRITICAL", label: "Critical", hint: "High-stakes or sensitive operations" },
] as const

const initialForm = () => ({
  name: "",
  description: "",
  ownerTeam: "",
  llmModel: "claude-sonnet-4-5",
  environment: "DEV" as string,
  tools: [] as ToolRow[],
  riskTier: "" as string,
  tags: "",
})

type RegisterAgentModalProps = {
  open: boolean
  onClose: () => void
}

export function RegisterAgentModal({ open, onClose }: RegisterAgentModalProps) {
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState(initialForm)
  const createAgent = useCreateAgent()

  // Reset wizard state whenever the dialog transitions to open so the user
  // gets a fresh form on each invocation. This is intentionally a state
  // reset on the rising edge of `open`, not a `key`-based remount: keeping
  // the same component instance avoids re-creating Radix's portal and
  // focus-trap on every reopen.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setStep(1)
      setFormData(initialForm())
    }
  }, [open])
  /* eslint-enable react-hooks/set-state-in-effect */

  const canNextStep1 = formData.name.trim().length > 0
  const canNextStep2 = true
  const canSubmit = RISK_OPTS.some((r) => r.value === formData.riskTier)

  const goNext = () => {
    if (step === 1 && !canNextStep1) return
    if (step === 2 && !canNextStep2) return
    if (step < 3) setStep((s) => s + 1)
  }

  const goBack = () => {
    if (step > 1) setStep((s) => s - 1)
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    const payload: Record<string, unknown> = {
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      ownerTeam: formData.ownerTeam.trim() || undefined,
      llmModel: formData.llmModel,
      environment: formData.environment,
      tools: formData.tools
        .filter((t) => t.name.trim())
        .map((t) => ({ name: t.name.trim(), description: t.description.trim() || undefined })),
      riskTier: formData.riskTier,
      tags: formData.tags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    }
    try {
      await createAgent.mutateAsync(payload)
      onClose()
    } catch {
      /* toast handled in hook */
    }
  }

  const addTool = () => {
    setFormData((f) => ({ ...f, tools: [...f.tools, { name: "", description: "" }] }))
  }

  const removeTool = (i: number) => {
    setFormData((f) => ({ ...f, tools: f.tools.filter((_, idx) => idx !== i) }))
  }

  const updateTool = (i: number, partial: Partial<ToolRow>) => {
    setFormData((f) => ({
      ...f,
      tools: f.tools.map((t, idx) => (idx === i ? { ...t, ...partial } : t)),
    }))
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Register agent</DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="ra-name">Name</Label>
              <Input
                id="ra-name"
                required
                value={formData.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ra-desc">Description</Label>
              <Textarea
                id="ra-desc"
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ra-owner">Owner team</Label>
              <Input
                id="ra-owner"
                value={formData.ownerTeam}
                onChange={(e) => setFormData((f) => ({ ...f, ownerTeam: e.target.value }))}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>LLM model</Label>
                <Select
                  value={formData.llmModel}
                  onValueChange={(v) => setFormData((f) => ({ ...f, llmModel: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="claude-sonnet-4-5">claude-sonnet-4-5</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Environment</Label>
                <Select
                  value={formData.environment}
                  onValueChange={(v) => setFormData((f) => ({ ...f, environment: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEV">DEV</SelectItem>
                    <SelectItem value="STAGING">STAGING</SelectItem>
                    <SelectItem value="PROD">PROD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <Label>Tools</Label>
              <Button type="button" variant="outline" size="sm" onClick={addTool}>
                Add tool
              </Button>
            </div>
            <div className="space-y-3">
              {formData.tools.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tools added yet.</p>
              ) : null}
              {formData.tools.map((t, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-start"
                >
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder="Tool name"
                      value={t.name}
                      onChange={(e) => updateTool(i, { name: e.target.value })}
                    />
                    <Input
                      placeholder="Description"
                      value={t.description}
                      onChange={(e) => updateTool(i, { description: e.target.value })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => removeTool(i)}
                    aria-label="Remove tool"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Risk tier</Label>
              <div className="grid gap-2">
                {RISK_OPTS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setFormData((f) => ({ ...f, riskTier: r.value }))}
                    className={cn(
                      "rounded-lg border p-3 text-left text-sm transition-colors hover:bg-muted/60",
                      formData.riskTier === r.value ? "border-primary bg-primary/5" : "border-border",
                    )}
                  >
                    <div className="font-medium">{r.label}</div>
                    <div className="text-muted-foreground">{r.hint}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ra-tags">Tags</Label>
              <Input
                id="ra-tags"
                placeholder="Comma-separated"
                value={formData.tags}
                onChange={(e) => setFormData((f) => ({ ...f, tags: e.target.value }))}
              />
            </div>
          </div>
        ) : null}

        <DialogFooter className="flex-col gap-4 sm:flex-col">
          <div className="flex justify-center gap-2">
            {[1, 2, 3].map((s) => (
              <span
                key={s}
                className={cn(
                  "h-2 w-2 rounded-full",
                  step === s ? "bg-primary" : "bg-muted",
                )}
              />
            ))}
          </div>
          <div className="flex w-full justify-between gap-2">
            <div>
              {step > 1 ? (
                <Button type="button" variant="outline" onClick={goBack}>
                  Back
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              {step < 3 ? (
                <Button type="button" onClick={goNext} disabled={step === 1 && !canNextStep1}>
                  Next
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={!canSubmit || createAgent.isPending}
                  onClick={() => void handleSubmit()}
                >
                  {createAgent.isPending ? "Submitting…" : "Submit"}
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
