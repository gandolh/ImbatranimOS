import { useCallback, useReducer } from 'react'
import { Button, cn } from '@imbatranim/core'
import {
  INITIAL_BASIC_STATE,
  applyPercent,
  backspace,
  clearAll,
  displayString,
  evaluateState,
  inputDigit,
  inputOperator,
  toggleSign,
  type BasicInputState,
  type OpGlyph,
} from './engine/basicInput'
import { useTopWindowKeydown } from './hooks/useTopWindowKeydown'

type Action =
  | { type: 'digit'; digit: string }
  | { type: 'operator'; symbol: OpGlyph }
  | { type: 'sign' }
  | { type: 'percent' }
  | { type: 'backspace' }
  | { type: 'clear' }
  | { type: 'equals' }

function reducer(state: BasicInputState, action: Action): BasicInputState {
  switch (action.type) {
    case 'digit':
      return inputDigit(state, action.digit)
    case 'operator':
      return inputOperator(state, action.symbol)
    case 'sign':
      return toggleSign(state)
    case 'percent':
      return applyPercent(state)
    case 'backspace':
      return backspace(state)
    case 'clear':
      return clearAll()
    case 'equals':
      return evaluateState(state)
  }
}

/** Basic mode: `+ − × ÷`, `%`, `±`, decimal, clear/back, precedence-correct `=`. */
export function BasicPad({ windowId }: { windowId: string }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_BASIC_STATE)

  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault()
      dispatch({ type: 'digit', digit: e.key })
      return
    }
    switch (e.key) {
      case '.':
        e.preventDefault()
        dispatch({ type: 'digit', digit: '.' })
        break
      case '+':
        e.preventDefault()
        dispatch({ type: 'operator', symbol: '+' })
        break
      case '-':
        e.preventDefault()
        dispatch({ type: 'operator', symbol: '−' })
        break
      case '*':
        e.preventDefault()
        dispatch({ type: 'operator', symbol: '×' })
        break
      case '/':
        e.preventDefault()
        dispatch({ type: 'operator', symbol: '÷' })
        break
      case '%':
        e.preventDefault()
        dispatch({ type: 'percent' })
        break
      case 'Enter':
      case '=':
        e.preventDefault()
        dispatch({ type: 'equals' })
        break
      case 'Backspace':
        e.preventDefault()
        dispatch({ type: 'backspace' })
        break
      case 'Escape':
        e.preventDefault()
        dispatch({ type: 'clear' })
        break
    }
  }, [])
  useTopWindowKeydown(windowId, onKey)

  const display = displayString(state)
  const isError = Boolean(state.error)

  return (
    <div className="flex h-full flex-col">
      <div className="border-outline-variant bg-surface-container-lowest flex flex-1 items-end justify-end overflow-hidden border-b px-3 py-4">
        <span
          className={cn(
            'font-ui truncate text-3xl font-medium tabular-nums',
            isError ? 'text-error' : 'text-on-surface'
          )}
          title={display}
        >
          {display}
        </span>
      </div>

      <div className="bg-surface-container-low grid flex-none grid-cols-4 gap-1 p-2">
        <Button className="w-full" onClick={() => dispatch({ type: 'clear' })}>
          C
        </Button>
        <Button
          className="w-full"
          title="Backspace"
          onClick={() => dispatch({ type: 'backspace' })}
        >
          ⌫
        </Button>
        <Button className="w-full" onClick={() => dispatch({ type: 'percent' })}>
          %
        </Button>
        <Button className="w-full" onClick={() => dispatch({ type: 'operator', symbol: '÷' })}>
          ÷
        </Button>

        <Button className="w-full" onClick={() => dispatch({ type: 'digit', digit: '7' })}>
          7
        </Button>
        <Button className="w-full" onClick={() => dispatch({ type: 'digit', digit: '8' })}>
          8
        </Button>
        <Button className="w-full" onClick={() => dispatch({ type: 'digit', digit: '9' })}>
          9
        </Button>
        <Button className="w-full" onClick={() => dispatch({ type: 'operator', symbol: '×' })}>
          ×
        </Button>

        <Button className="w-full" onClick={() => dispatch({ type: 'digit', digit: '4' })}>
          4
        </Button>
        <Button className="w-full" onClick={() => dispatch({ type: 'digit', digit: '5' })}>
          5
        </Button>
        <Button className="w-full" onClick={() => dispatch({ type: 'digit', digit: '6' })}>
          6
        </Button>
        <Button className="w-full" onClick={() => dispatch({ type: 'operator', symbol: '−' })}>
          −
        </Button>

        <Button className="w-full" onClick={() => dispatch({ type: 'digit', digit: '1' })}>
          1
        </Button>
        <Button className="w-full" onClick={() => dispatch({ type: 'digit', digit: '2' })}>
          2
        </Button>
        <Button className="w-full" onClick={() => dispatch({ type: 'digit', digit: '3' })}>
          3
        </Button>
        <Button className="w-full" onClick={() => dispatch({ type: 'operator', symbol: '+' })}>
          +
        </Button>

        <Button className="w-full" title="Toggle sign" onClick={() => dispatch({ type: 'sign' })}>
          ±
        </Button>
        <Button className="w-full" onClick={() => dispatch({ type: 'digit', digit: '0' })}>
          0
        </Button>
        <Button className="w-full" onClick={() => dispatch({ type: 'digit', digit: '.' })}>
          .
        </Button>
        <Button variant="primary" className="w-full" onClick={() => dispatch({ type: 'equals' })}>
          =
        </Button>
      </div>
    </div>
  )
}
