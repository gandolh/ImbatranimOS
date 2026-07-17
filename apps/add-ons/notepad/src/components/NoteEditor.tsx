import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowLeft, Eye, Edit3, Save } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@imbatranim/core'
import { ScrollArea } from '@imbatranim/core'
import { useNoteFileQuery, useUpdateFileMutation } from '../queries/notepadQueries'

export function NoteEditor({ path, onBack }: { path: string; onBack: () => void }) {
  const { data: file, isLoading } = useNoteFileQuery(path)
  const updateMutation = useUpdateFileMutation()

  const [content, setContent] = useState('')
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [lastSaved, setLastSaved] = useState<number | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset the draft when a (re)loaded file arrives — state adjustment during
  // render instead of an effect (react.dev/you-might-not-need-an-effect)
  const [prevFile, setPrevFile] = useState<{ path: string; content: string } | null>(null)
  if (file && (file.path !== prevFile?.path || file.content !== prevFile?.content)) {
    setPrevFile({ path: file.path, content: file.content })
    setContent(file.content)
  }

  const handleSave = useCallback(
    (newContent: string) => {
      updateMutation.mutate(
        { path, content: newContent },
        {
          onSuccess: () => {
            setLastSaved(Date.now())
            setTimeout(() => setLastSaved(null), 2000)
          },
        }
      )
    },
    [path, updateMutation]
  )

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setContent(val)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      handleSave(val)
    }, 1000)
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  if (isLoading) return <div className="p-4 text-center">Loading...</div>

  return (
    <div className="bg-surface-container-lowest flex h-full flex-col overflow-hidden">
      {/* toolbar */}
      <div className="border-outline-variant bg-surface-container-low flex h-10 shrink-0 items-center justify-between border-b px-3 py-1">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="hover:bg-surface-container-high p-1"
            title="Back to browser"
          >
            <ArrowLeft size={16} />
          </button>
          <span className="max-w-[150px] truncate text-[12px] font-semibold">
            {path.split('/').pop()}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <div
            className={cn(
              'text-on-surface-variant mr-2 flex items-center gap-1 text-[10px] transition-opacity',
              lastSaved ? 'opacity-100' : 'opacity-0'
            )}
          >
            <Save size={10} /> Saved
          </div>
          <button
            onClick={() => setMode('edit')}
            className={cn('p-1.5', mode === 'edit' && 'bg-primary text-on-primary')}
            title="Edit"
          >
            <Edit3 size={14} />
          </button>
          <button
            onClick={() => setMode('preview')}
            className={cn('p-1.5', mode === 'preview' && 'bg-primary text-on-primary')}
            title="Preview"
          >
            <Eye size={14} />
          </button>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <div
          className={cn(
            'absolute inset-0 transition-opacity duration-200',
            mode === 'edit' ? 'z-10 opacity-100' : 'pointer-events-none z-0 opacity-0'
          )}
        >
          <textarea
            className="h-full w-full resize-none bg-transparent p-4 font-mono text-[13px] outline-none"
            value={content}
            onChange={handleChange}
            placeholder="Write markdown here..."
            spellCheck={false}
          />
        </div>

        <div
          className={cn(
            'absolute inset-0 transition-opacity duration-200',
            mode === 'preview' ? 'z-10 opacity-100' : 'pointer-events-none z-0 opacity-0'
          )}
        >
          <ScrollArea className="h-full">
            <div className="prose prose-sm prose-headings:font-ui prose-p:font-content prose-a:text-primary max-w-none p-6">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
