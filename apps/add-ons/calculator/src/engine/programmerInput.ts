import {
  type Base,
  parseInBase,
  formatInBase,
  bitAnd,
  bitOr,
  bitXor,
  bitNot,
  shiftLeft,
  shiftRight,
  addP,
  subP,
  mulP,
  divP,
} from './programmer'
import { DivisionByZeroError } from './errors'

/**
 * Pure input-reducer for Programmer mode. Classic accumulator + pending-op
 * calculator flow (value, operator, value, `=`) rather than a typed
 * expression — the norm for programmer/scientific calculators, and it keeps
 * every intermediate value an exact clamped 64-bit bigint.
 */

export type ProgOp = '+' | '−' | '×' | '÷' | 'AND' | 'OR' | 'XOR' | '<<' | '>>'

export type ProgrammerState = {
  base: Base
  /** Raw digits typed in `base`; '' displays as the accumulator (or 0). */
  current: string
  acc: bigint | null
  pendingOp: ProgOp | null
  error: string | null
}

export const INITIAL_PROGRAMMER_STATE: ProgrammerState = {
  base: 16,
  current: '',
  acc: null,
  pendingOp: null,
  error: null,
}

function currentValue(state: ProgrammerState): bigint {
  return parseInBase(state.current || '0', state.base)
}

function applyOp(op: ProgOp, a: bigint, b: bigint): bigint {
  switch (op) {
    case '+':
      return addP(a, b)
    case '−':
      return subP(a, b)
    case '×':
      return mulP(a, b)
    case '÷':
      return divP(a, b)
    case 'AND':
      return bitAnd(a, b)
    case 'OR':
      return bitOr(a, b)
    case 'XOR':
      return bitXor(a, b)
    case '<<':
      return shiftLeft(a, b)
    case '>>':
      return shiftRight(a, b)
  }
}

function errorState(state: ProgrammerState, message: string): ProgrammerState {
  return { ...state, error: message, acc: null, pendingOp: null, current: '' }
}

export function displayValue(state: ProgrammerState): bigint {
  if (state.current !== '') return currentValue(state)
  if (state.acc !== null) return state.acc
  return 0n
}

export function displayString(state: ProgrammerState): string {
  if (state.error) return state.error
  return formatInBase(displayValue(state), state.base)
}

export function inputDigit(state: ProgrammerState, digit: string): ProgrammerState {
  if (state.error) return { ...INITIAL_PROGRAMMER_STATE, base: state.base, current: digit }
  const current = state.current === '0' ? digit : state.current + digit
  return { ...state, current }
}

/** Re-renders whatever value is currently on screen into the new base. */
export function setBase(state: ProgrammerState, base: Base): ProgrammerState {
  if (state.error) return { ...INITIAL_PROGRAMMER_STATE, base }
  const value = displayValue(state)
  if (state.current !== '') {
    return { ...state, base, current: formatInBase(value, base) }
  }
  return { ...state, base }
}

export function pressOperator(state: ProgrammerState, op: ProgOp): ProgrammerState {
  if (state.error) return state
  if (state.acc === null) {
    return { ...state, acc: currentValue(state), pendingOp: op, current: '' }
  }
  if (state.current === '') {
    // Operator pressed twice in a row — just swap which one is pending.
    return { ...state, pendingOp: op }
  }
  try {
    const result = applyOp(state.pendingOp ?? op, state.acc, currentValue(state))
    return { ...state, acc: result, pendingOp: op, current: '' }
  } catch (err) {
    return errorState(state, err instanceof DivisionByZeroError ? 'Division by zero' : 'Error')
  }
}

export function pressNot(state: ProgrammerState): ProgrammerState {
  if (state.error) return state
  return { ...state, current: formatInBase(bitNot(currentValue(state)), state.base) }
}

export function pressEquals(state: ProgrammerState): ProgrammerState {
  if (state.error) return state
  if (state.pendingOp === null || state.acc === null) return state
  const b = state.current === '' ? state.acc : currentValue(state)
  try {
    const result = applyOp(state.pendingOp, state.acc, b)
    return { ...state, current: formatInBase(result, state.base), acc: null, pendingOp: null }
  } catch (err) {
    return errorState(state, err instanceof DivisionByZeroError ? 'Division by zero' : 'Error')
  }
}

export function backspace(state: ProgrammerState): ProgrammerState {
  if (state.error) return { ...INITIAL_PROGRAMMER_STATE, base: state.base }
  return { ...state, current: state.current.slice(0, -1) }
}

export function clearAll(state: ProgrammerState): ProgrammerState {
  return { ...INITIAL_PROGRAMMER_STATE, base: state.base }
}
