import { useEffect, useState } from "react"
import { ConfirmDialog } from "@/components/shared"
import { Button } from "@/components/ui/button"
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
import { useUpdateAgent, useUpdateAgentStatus } from "@/hooks/useAgents"

type AgentSettingsTabProps = {
  agent: any
}

type StatusAction = "ACTIVATE" | "SUSPEND" | "DEPRECATE"

const STATUS_MAP: Record<StatusAction, string> = {
  ACTIVATE: "ACTIVE",
  SUSPEND: "SUSPENDED",
  DEPRECATE: "DEPRECATED",
}

export function AgentSettingsTab({ agent }: AgentSettingsTabProps) {
  const id = agent?.id ?? agent?.agentId
  const update = useUpdateAgent(id ?? "")
  const statusMut = useUpdateAgentStatus(id ?? "")

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [ownerTeam, setOwnerTeam] = useState("")
  const [llmModel, setLlmModel] = useState("claude-sonnet-4-5")
  const [tags, setTags] = useState("")
  const [confirm, setConfirm] = useState<StatusAction | null>(null)

  useEffect(() => {
    if (!agent) return
    setName(agent.name ?? "")
    setDescription(agent.description ?? "")
    setOwnerTeam(agent.ownerTeam ?? agent.owner_team ?? "")
    setLlmModel(agent.llmModel ?? agent.llm_model ?? "claude-sonnet-4-5")
    const t = agent.tags
    setTags(Array.isArray(t) ? t.join(", ") : typeof t === "string" ? t : "")
  }, [agent])

  if (!id) {
    return null
  }

  const status = String(agent?.status ?? "").toUpperCase()

  const save = () => {
    update.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      ownerTeam: ownerTeam.trim() || undefined,
      llmModel,
      tags: tags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    })
  }

  const applyStatus = async (action: StatusAction) => {
    await statusMut.mutateAsync({ status: STATUS_MAP[action] })
    setConfirm(null)
  }

  const confirmCopy: Record<
    StatusAction,
    { title: string; description: string; label: string; destructive?: boolean }
  > = {
    ACTIVATE: {
      title: "Activate agent?",
      description: "This agent will be marked as ACTIVE.",
      label: "Activate",
    },
    SUSPEND: {
      title: "Suspend agent?",
      description: "This agent will be suspended and stop processing new work.",
      label: "Suspend",
      destructive: true,
    },
    DEPRECATE: {
      title: "Deprecate agent?",
      description: "This agent will be marked as deprecated.",
      label: "Deprecate",
      destructive: true,
    },
  }

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="as-name">Name</Label>
          <Input id="as-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="as-desc">Description</Label>
          <Textarea
            id="as-desc"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="as-owner">Owner team</Label>
          <Input id="as-owner" value={ownerTeam} onChange={(e) => setOwnerTeam(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>LLM model</Label>
          <Select value={llmModel} onValueChange={setLlmModel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="claude-sonnet-4-5">claude-sonnet-4-5</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="as-tags">Tags</Label>
          <Input
            id="as-tags"
            placeholder="Comma-separated"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </div>
        <Button type="button" onClick={save} disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>

      <div className="space-y-3 border-t pt-6">
        <h3 className="text-sm font-semibold">Status</h3>
        <div className="flex flex-wrap gap-2">
          {status !== "ACTIVE" ? (
            <Button type="button" variant="secondary" onClick={() => setConfirm("ACTIVATE")}>
              Activate
            </Button>
          ) : null}
          {status !== "SUSPENDED" ? (
            <Button type="button" variant="outline" onClick={() => setConfirm("SUSPEND")}>
              Suspend
            </Button>
          ) : null}
          {status !== "DEPRECATED" ? (
            <Button type="button" variant="outline" onClick={() => setConfirm("DEPRECATE")}>
              Deprecate
            </Button>
          ) : null}
        </div>
      </div>

      {confirm ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setConfirm(null)}
          title={confirmCopy[confirm].title}
          description={confirmCopy[confirm].description}
          confirmLabel={confirmCopy[confirm].label}
          variant={confirmCopy[confirm].destructive ? "destructive" : "default"}
          onConfirm={() => applyStatus(confirm)}
        />
      ) : null}
    </div>
  )
}
