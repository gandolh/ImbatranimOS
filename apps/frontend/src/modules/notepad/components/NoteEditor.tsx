import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowLeft, Eye, Edit3, Save } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '../../../lib/cn'
import { ScrollArea } from '../../../shared/components/ui/ScrollArea'
import { useNoteFileQuery, useUpdateFileMutation } from '../queries/notepadQueries'

export function NoteEditor({
  path,
  onBack,
}: {
  path: string
  onBack: () => void
}) {
  const { data: file, isLoading } = useNoteFileQuery(path)
  const updateMutation = useUpdateFileMutation()
  
  const [content, setContent] = useState('')
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [lastSaved, setLastSaved] = useState<number | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (file) setContent(file.content)
  }, [file?.path, file?.content])

  const handleSave = useCallback((newContent: string) => {
    updateMutation.mutate({ path, content: newContent }, {
      onSuccess: () => {
        setLastSaved(Date.now())
        setTimeout(() => setLastSaved(null), 2000)
      }
    })
  }, [path, updateMutation])

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
    <div className="flex h-full flex-col bg-surface-container-lowest overflow-hidden">
      {/* toolbar */}
      <div className="flex items-center justify-between px-3 py-1 border-b border-outline-variant h-10 bg-surface-container-low shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="p-1 hover:bg-surface-container-high" title="Back to browser">
            <ArrowLeft size={16} />
          </button>
          <span className="text-[12px] font-semibold truncate max-w-[150px]">{path.split('/').pop()}</span>
        </div>
        
        <div className="flex items-center gap-1">
          <div className={cn(
            "text-[10px] text-on-surface-variant transition-opacity flex items-center gap-1 mr-2",
            lastSaved ? "opacity-100" : "opacity-0"
          )}>
            <Save size={10} /> Saved
          </div>
          <button 
            onClick={() => setMode('edit')} 
            className={cn("p-1.5", mode === 'edit' && "bg-primary text-on-primary")}
            title="Edit"
          >
            <Edit3 size={14} />
          </button>
          <button 
            onClick={() => setMode('preview')} 
            className={cn("p-1.5", mode === 'preview' && "bg-primary text-on-primary")}
            title="Preview"
          >
            <Eye size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <div className={cn(
          "absolute inset-0 transition-opacity duration-200", 
          mode === 'edit' ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
        )}>
          <textarea
            className="w-full h-full p-4 font-mono text-[13px] bg-transparent outline-none resize-none"
            value={content}
            onChange={handleChange}
            placeholder="Write markdown here..."
            spellCheck={false}
          />
        </div>
        
        <div className={cn(
          "absolute inset-0 transition-opacity duration-200", 
          mode === 'preview' ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
        )}>
          <ScrollArea className="h-full">
            <div className="p-6 prose prose-sm max-w-none prose-headings:font-ui prose-p:font-content prose-a:text-primary">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
              </ReactMarkdown>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
