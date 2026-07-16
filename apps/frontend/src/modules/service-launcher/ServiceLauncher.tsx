import { useState } from 'react'
import { Play, Square, Terminal as TerminalIcon, Server, Search, Activity } from 'lucide-react'
import { cn } from '../../lib/cn'
import { ScrollArea } from '../../shared/components/ui/ScrollArea'
import { useServices, useStartService, useStopService } from './queries/servicesQueries'
import { TerminalViewer } from './components/TerminalViewer'

export function ServiceLauncher({ windowId: _windowId }: { windowId: string }) {
  const { data: services = [], isLoading } = useServices()
  const startMutation = useStartService()
  const stopMutation = useStopService()
  
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredServices = services.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const selectedService = services.find(s => s.id === selectedId)

  if (isLoading && services.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-container-lowest font-ui text-[13px] text-on-surface-variant">
         <div className="flex flex-col items-center gap-3">
            <Activity className="animate-spin text-primary" size={24} />
            <span>Connecting to services...</span>
         </div>
      </div>
    )
  }

  return (
    <div className="flex h-full bg-surface-container-lowest overflow-hidden select-none">
      {/* Sidebar: Service List */}
      <div className={cn(
        "flex flex-col border-r border-outline-variant transition-all duration-300",
        selectedId ? "w-64" : "w-full"
      )}>
        <div className="p-4 border-b border-outline-variant space-y-3 bg-surface-container-low">
          <div className="flex items-center gap-2 text-primary">
            <Server size={18} />
            <h1 className="font-ui font-bold text-sm uppercase tracking-wider">Services</h1>
            <span className="ml-auto text-[10px] font-mono bg-primary/10 px-1.5 py-0.5 rounded text-primary">
              {services.filter(s => s.status === 'running').length}/{services.length}
            </span>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant opacity-50" />
            <input 
              type="text" 
              placeholder="Filter services..."
              className="w-full pl-9 pr-3 py-1.5 bg-surface-container-lowest text-[12px] rounded-md border border-outline-variant focus:outline-none focus:ring-1 focus:ring-primary/30 font-ui"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="flex flex-col">
            {filteredServices.map((service) => (
              <div 
                key={service.id}
                onClick={() => setSelectedId(service.id)}
                className={cn(
                  "group flex items-center gap-3 p-3 border-b border-outline-variant/30 cursor-pointer hover:bg-surface-container-low transition-all duration-200",
                  selectedId === service.id && "bg-primary/5 border-l-4 border-l-primary"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-300",
                  service.status === 'running' ? "bg-secondary/20 text-secondary" : "bg-surface-container-high text-on-surface-variant"
                )}>
                   <TerminalIcon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-ui font-bold text-[13px] truncate text-on-surface">{service.name}</div>
                  <div className="text-[10px] text-on-surface-variant opacity-60 truncate font-mono">{service.command}</div>
                </div>
                <div className={cn(
                  "flex items-center gap-1 transition-opacity",
                  selectedId === service.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}>
                   {service.status === 'running' ? (
                     <button 
                       onClick={(e) => { e.stopPropagation(); stopMutation.mutate(service.id) }}
                       className="p-1.5 hover:text-error transition-colors"
                       disabled={stopMutation.isPending}
                       title="Stop Service"
                     >
                        <Square size={14} fill="currentColor" />
                     </button>
                   ) : (
                     <button 
                       onClick={(e) => { e.stopPropagation(); startMutation.mutate(service.id) }}
                       className="p-1.5 hover:text-secondary transition-colors"
                       disabled={startMutation.isPending}
                       title="Start Service"
                     >
                        <Play size={14} fill="currentColor" />
                     </button>
                   )}
                </div>
              </div>
            ))}
            {filteredServices.length === 0 && (
              <div className="p-8 text-center text-on-surface-variant opacity-50 font-ui text-[12px]">
                No services found.
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content: Terminal */}
      <div className="flex-1 bg-slate-900 overflow-hidden relative">
        {selectedService ? (
          <TerminalViewer 
            id={selectedService.id} 
            onClose={() => setSelectedId(null)} 
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-6 opacity-20 select-none">
            <Server size={80} strokeWidth={1} className="text-on-surface" />
            <div className="text-center">
              <p className="font-ui font-bold text-lg uppercase tracking-[0.2em] text-on-surface">Service Launcher</p>
              <p className="text-sm mt-2 text-on-surface">Select a service to view logs and manage process</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
