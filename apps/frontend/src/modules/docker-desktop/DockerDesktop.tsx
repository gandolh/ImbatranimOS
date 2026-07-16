import { useState } from 'react'
import { Play, Square, RotateCw, Trash2, Terminal, Activity, Container as ContainerIcon } from 'lucide-react'
import { cn } from '../../lib/cn'
import { ScrollArea } from '../../shared/components/ui/ScrollArea'
import {
  useContainersQuery,
  useContainerLogsQuery,
  useRemoveContainerMutation,
  useRestartContainerMutation,
  useStartContainerMutation,
  useStopContainerMutation,
} from './queries/dockerQueries'

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------
function StatusBadge({ state }: { state: string }) {
  const styles: Record<string, string> = {
    running: 'bg-secondary/20 text-secondary border-secondary/30',
    exited: 'bg-error/20 text-error border-error/30',
    paused: 'bg-yellow-500/20 text-yellow-600 border-yellow-500/30',
    restarting: 'bg-primary/20 text-primary border-primary/30',
  }

  return (
    <span className={cn(
      "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tighter border",
      styles[state] || 'bg-surface-container-high text-on-surface-variant border-outline-variant'
    )}>
      {state}
    </span>
  )
}

// ---------------------------------------------------------------------------
// DockerDesktop (root export)
// ---------------------------------------------------------------------------
export function DockerDesktop({ windowId: _windowId }: { windowId: string }) {
  const { data: containers = [], isLoading } = useContainersQuery()
  const startMutation = useStartContainerMutation()
  const stopMutation = useStopContainerMutation()
  const restartMutation = useRestartContainerMutation()
  const removeMutation = useRemoveContainerMutation()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { data: logs } = useContainerLogsQuery(selectedId)

  const selectedContainer = containers.find(c => c.id === selectedId)

  if (isLoading && containers.length === 0) {
    return <div className="flex h-full items-center justify-center font-ui text-[13px]">Connecting to Docker...</div>
  }

  return (
    <div className="flex h-full flex-col bg-surface-container-lowest overflow-hidden">
      {/* Header Stat Area */}
      <div className="flex h-12 items-center px-4 border-b border-outline-variant bg-surface-container-low gap-6">
         <div className="flex items-center gap-2">
            <Activity size={14} className="text-primary" />
            <span className="font-ui font-bold text-[11px] uppercase tracking-wider">Dashboard</span>
         </div>
         <div className="flex gap-4 items-center">
            <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-secondary" />
                <span className="text-[11px] font-medium">{containers.filter(c => c.state === 'running').length} Running</span>
            </div>
            <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-error" />
                <span className="text-[11px] font-medium">{containers.filter(c => c.state === 'exited').length} Stopped</span>
            </div>
         </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Container List */}
        <div className={cn("flex-1 flex flex-col border-r border-outline-variant", selectedId && "max-w-[40%]")}>
            <ScrollArea className="flex-1">
                <div className="flex flex-col">
                    {containers.map((container) => (
                        <div 
                            key={container.id} 
                            onClick={() => setSelectedId(container.id)}
                            className={cn(
                                "group flex flex-col p-3 border-b border-outline-variant/50 cursor-pointer hover:bg-surface-container-low transition-colors transition-all duration-200",
                                selectedId === container.id && "bg-primary/5 border-l-4 border-l-primary"
                            )}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2 min-w-0">
                                    <ContainerIcon size={14} className="shrink-0 text-on-surface-variant" />
                                    <span className="font-ui font-bold text-[13px] truncate">{container.names[0].replace(/^\//, '')}</span>
                                </div>
                                <StatusBadge state={container.state} />
                            </div>
                            <div className="text-[11px] text-on-surface-variant truncate opacity-70 mb-2">
                                {container.image}
                            </div>
                            
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {container.state === 'running' ? (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); stopMutation.mutate(container.id) }} 
                                        className="p-1 hover:text-error" title="Stop"
                                    >
                                        <Square size={13} fill="currentColor" />
                                    </button>
                                ) : (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); startMutation.mutate(container.id) }} 
                                        className="p-1 hover:text-secondary" title="Start"
                                    >
                                        <Play size={13} fill="currentColor" />
                                    </button>
                                )}
                                <button 
                                    onClick={(e) => { e.stopPropagation(); restartMutation.mutate(container.id) }} 
                                    className="p-1 hover:text-primary" title="Restart"
                                >
                                    <RotateCw size={13} />
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); if(confirm('Remove container?')) removeMutation.mutate(container.id) }} 
                                    className="p-1 hover:text-error ml-auto" title="Remove"
                                >
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        </div>
                    ))}
                    {containers.length === 0 && (
                        <div className="p-8 text-center text-on-surface-variant opacity-50 font-ui text-[12px]">
                            No containers found.
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>

        {/* Log Viewer */}
        <div className="flex-1 flex flex-col bg-slate-950 text-slate-300">
            {selectedId ? (
                <>
                    <div className="flex h-9 items-center justify-between px-3 border-b border-white/10 bg-white/5">
                        <div className="flex items-center gap-2">
                            <Terminal size={14} />
                            <span className="text-[11px] font-mono font-bold uppercase tracking-widest truncate max-w-[200px]">
                                {selectedContainer?.names[0].replace(/^\//, '')} logs
                            </span>
                        </div>
                        <button onClick={() => setSelectedId(null)} className="text-[11px] hover:text-white px-2">Close</button>
                    </div>
                    <ScrollArea className="flex-1">
                        <pre className="p-4 font-mono text-[11px] whitespace-pre-wrap leading-relaxed">
                            {logs || 'Fetching logs...'}
                        </pre>
                    </ScrollArea>
                </>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 opacity-30">
                    <Terminal size={48} strokeWidth={1} />
                    <span className="font-ui text-[13px] tracking-widest uppercase">Select a container to view logs</span>
                </div>
            )}
        </div>
      </div>
    </div>
  )
}
