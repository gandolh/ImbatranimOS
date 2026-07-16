import { useState } from 'react'
import { Pencil, Trash2, Play } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { Button } from '../../../shared/components/ui/Button'
import { Input } from '../../../shared/components/ui/Input'
import { ScrollArea } from '../../../shared/components/ui/ScrollArea'
import { createSession } from '../api/replApi'
import {
  useReplConfigsQuery,
  useCreateConfigMutation,
  useUpdateConfigMutation,
  useDeleteConfigMutation,
} from '../queries/replQueries'
import type { ReplConfig } from '../types'

interface ConfigsTabProps {
  onStartSession: (config: ReplConfig, sessionId: string) => void
}

interface FormState {
  name: string
  command: string
  args: string
  cwd: string
  prompt_prefix: string
}

const emptyForm: FormState = {
  name: '',
  command: '',
  args: '',
  cwd: '',
  prompt_prefix: '>',
}

export function ConfigsTab({ onStartSession }: ConfigsTabProps) {
  const { data: configs = [], isLoading } = useReplConfigsQuery()
  const createMutation = useCreateConfigMutation()
  const updateMutation = useUpdateConfigMutation()
  const deleteMutation = useDeleteConfigMutation()

  const [editingId, setEditingId] = useState<number | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [startingId, setStartingId] = useState<number | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  function handleEditClick(config: ReplConfig) {
    setEditingId(config.id)
    setShowNewForm(false)
    setForm({
      name: config.name,
      command: config.command,
      args: config.args,
      cwd: config.cwd,
      prompt_prefix: config.prompt_prefix,
    })
  }

  function handleNewClick() {
    setShowNewForm(true)
    setEditingId(null)
    setForm(emptyForm)
  }

  function handleCancel() {
    setEditingId(null)
    setShowNewForm(false)
    setForm(emptyForm)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.command.trim()) return
    setFormError(null)
    try {
      if (editingId !== null) {
        await updateMutation.mutateAsync({ id: editingId, data: form })
      } else {
        await createMutation.mutateAsync(form)
      }
      handleCancel()
    } catch {
      setFormError('Failed to save configuration. Please try again.')
    }
  }

  async function handleDelete(id: number) {
    setFormError(null)
    try {
      await deleteMutation.mutateAsync(id)
    } catch {
      setFormError('Failed to delete configuration.')
    }
  }

  async function handleStart(config: ReplConfig) {
    setStartingId(config.id)
    setStartError(null)
    try {
      const { sessionId } = await createSession(config.id)
      onStartSession(config, sessionId)
    } catch {
      setStartError(`Failed to start ${config.name}. Check command and working directory.`)
    } finally {
      setStartingId(null)
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="flex flex-col h-full bg-surface-container-lowest">
      {(startError || formError) && (
        <div className="px-4 py-2 bg-error/10 border-b border-error/30 text-error font-ui text-[12px]">
          {startError || formError}
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="flex flex-col">
          {isLoading && (
            <div className="p-6 text-center font-ui text-[12px] text-on-surface-variant">
              Loading configurations...
            </div>
          )}

          {!isLoading && configs.length === 0 && !showNewForm && (
            <div className="p-8 text-center font-ui text-[12px] text-on-surface-variant opacity-60">
              No configurations yet. Create one below.
            </div>
          )}

          {configs.map((config) =>
            editingId === config.id ? (
              <InlineForm
                key={config.id}
                form={form}
                onChange={setForm}
                onSave={handleSave}
                onCancel={handleCancel}
                isSaving={isSaving}
              />
            ) : (
              <div
                key={config.id}
                className={cn(
                  'group flex items-center gap-3 px-4 py-3 border-b border-outline-variant cursor-pointer',
                  'hover:bg-surface-container-low transition-colors',
                )}
                onClick={() => handleStart(config)}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-ui font-medium text-[13px] text-on-surface truncate">
                    {config.name}
                  </div>
                  <div className="font-ui text-[11px] text-on-surface-variant truncate">
                    {config.command}
                    {config.args ? ' ' + config.args : ''}
                    {config.cwd ? ` — ${config.cwd}` : ''}
                  </div>
                </div>

                {startingId === config.id ? (
                  <span className="font-ui text-[11px] text-on-surface-variant">Starting...</span>
                ) : (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleStart(config) }}
                      className="p-1.5 text-on-surface-variant hover:text-primary transition-colors"
                      title="Start session"
                    >
                      <Play size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEditClick(config) }}
                      className="p-1.5 text-on-surface-variant hover:text-primary transition-colors"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(config.id) }}
                      className="p-1.5 text-on-surface-variant hover:text-error transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ),
          )}

          {showNewForm && (
            <InlineForm
              form={form}
              onChange={setForm}
              onSave={handleSave}
              onCancel={handleCancel}
              isSaving={isSaving}
            />
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-outline-variant p-3 bg-surface-container-low">
        <Button
          onClick={handleNewClick}
          disabled={showNewForm}
          size="sm"
          className="w-full"
        >
          + New Configuration
        </Button>
      </div>
    </div>
  )
}

interface InlineFormProps {
  form: FormState
  onChange: (form: FormState) => void
  onSave: () => void
  onCancel: () => void
  isSaving: boolean
}

function InlineForm({ form, onChange, onSave, onCancel, isSaving }: InlineFormProps) {
  function field(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ ...form, [key]: e.target.value })
  }

  return (
    <div className="p-4 border-b border-outline-variant bg-surface-container-low space-y-3">
      <Input
        label="Name"
        value={form.name}
        onChange={field('name')}
        placeholder="Node"
      />
      <Input
        label="Command"
        value={form.command}
        onChange={field('command')}
        placeholder="node"
      />
      <Input
        label="Args"
        value={form.args}
        onChange={field('args')}
        placeholder="--experimental-repl-await"
      />
      <Input
        label="Working Directory"
        value={form.cwd}
        onChange={field('cwd')}
        placeholder="/home/user/projects"
      />
      <Input
        label="Prompt Prefix"
        value={form.prompt_prefix}
        onChange={field('prompt_prefix')}
        placeholder=">"
      />
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="primary" onClick={onSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save'}
        </Button>
        <Button size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
