import { useState } from 'react'
import { cn } from '@imbatranim/core'
import { BasicPad } from './BasicPad'
import { ProgrammerPad } from './ProgrammerPad'

type Mode = 'basic' | 'programmer'

/** Window contract: ComponentType<{ windowId: string }>. Single-instance app. */
export function Calculator({ windowId }: { windowId: string }) {
  const [mode, setMode] = useState<Mode>('basic')

  return (
    <div className="bg-surface-container-lowest flex h-full flex-col select-none">
      <div className="border-outline-variant bg-surface-container-low flex flex-none border-b">
        <button
          onClick={() => setMode('basic')}
          className={cn(
            'font-ui flex-1 border-b-2 px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase transition-colors',
            mode === 'basic'
              ? 'border-primary text-on-surface'
              : 'text-on-surface-variant hover:text-on-surface border-transparent'
          )}
        >
          Basic
        </button>
        <button
          onClick={() => setMode('programmer')}
          className={cn(
            'font-ui flex-1 border-b-2 px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase transition-colors',
            mode === 'programmer'
              ? 'border-primary text-on-surface'
              : 'text-on-surface-variant hover:text-on-surface border-transparent'
          )}
        >
          Programmer
        </button>
      </div>

      <div className="min-h-0 flex-1">
        {mode === 'basic' ? (
          <BasicPad windowId={windowId} />
        ) : (
          <ProgrammerPad windowId={windowId} />
        )}
      </div>
    </div>
  )
}
