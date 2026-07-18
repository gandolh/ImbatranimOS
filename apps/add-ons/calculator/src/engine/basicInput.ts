import { evaluate, formatResult } from './evaluate'
import { DivisionByZeroError } from './errors'

/**
 * Pure input-reducer for Basic mode. Keeps the expression as a flat list of
 * alternating number/operator tokens (never two numbers or two operators
 * back to back) so button handlers (digit, sign, percent, backspace) can
 * mutate "the number currently being typed" unambiguously, then hands the
 * flattened string to the tokenizer/evaluator in `evaluate.ts` on `=`.
 */

export type OpGlyph = '+' | '−' | '×' | '÷'

export type BasicToken = { kind: 'num'; text: string } | { kind: 'op'; symbol: OpGlyph }

export type BasicInputState = {
  tokens: BasicToken[]
  /** Formatted result from the last `=`, shown while `tokens` is empty. */
  result: string | null
  error: string | null
}

export const INITIAL_BASIC_STATE: BasicInputState = { tokens: [], result: null, error: null }

function exprString(tokens: BasicToken[]): string {
  return tokens.map((t) => (t.kind === 'num' ? t.text : t.symbol)).join('')
}

export function displayString(state: BasicInputState): string {
  if (state.error) return state.error
  if (state.tokens.length === 0) return state.result ?? '0'
  return exprString(state.tokens) || '0'
}

export function inputDigit(state: BasicInputState, digit: string): BasicInputState {
  if (state.error) {
    return {
      tokens: [{ kind: 'num', text: digit === '.' ? '0.' : digit }],
      result: null,
      error: null,
    }
  }
  const tokens = [...state.tokens]
  const last = tokens[tokens.length - 1]
  if (!last || last.kind === 'op') {
    tokens.push({ kind: 'num', text: digit === '.' ? '0.' : digit })
  } else if (digit === '.' && last.text.includes('.')) {
    return state // already has a decimal point — ignore
  } else if (last.text === '0' && digit !== '.') {
    tokens[tokens.length - 1] = { kind: 'num', text: digit }
  } else {
    tokens[tokens.length - 1] = { kind: 'num', text: last.text + digit }
  }
  return { tokens, result: null, error: null }
}

export function inputOperator(state: BasicInputState, symbol: OpGlyph): BasicInputState {
  if (state.error) return state
  let tokens = [...state.tokens]
  if (tokens.length === 0) {
    if (state.result === null) return state // nothing to operate on yet
    tokens = [{ kind: 'num', text: state.result }]
  }
  const last = tokens[tokens.length - 1]
  if (last.kind === 'op') {
    tokens[tokens.length - 1] = { kind: 'op', symbol }
  } else {
    tokens.push({ kind: 'op', symbol })
  }
  return { tokens, result: null, error: null }
}

export function toggleSign(state: BasicInputState): BasicInputState {
  if (state.error) return state
  if (state.tokens.length === 0) {
    if (state.result === null) return state
    const result = state.result.startsWith('-') ? state.result.slice(1) : `-${state.result}`
    return { tokens: [], result, error: null }
  }
  const tokens = [...state.tokens]
  const last = tokens[tokens.length - 1]
  if (last.kind !== 'num') return state
  const text = last.text.startsWith('-') ? last.text.slice(1) : `-${last.text}`
  tokens[tokens.length - 1] = { kind: 'num', text }
  return { ...state, tokens }
}

export function applyPercent(state: BasicInputState): BasicInputState {
  if (state.error) return state
  if (state.tokens.length === 0) {
    if (state.result === null) return state
    return { tokens: [], result: formatResult(Number(state.result) / 100), error: null }
  }
  const tokens = [...state.tokens]
  const last = tokens[tokens.length - 1]
  if (last.kind !== 'num' || last.text === '' || last.text === '-') return state
  tokens[tokens.length - 1] = { kind: 'num', text: formatResult(Number(last.text) / 100) }
  return { ...state, tokens }
}

export function backspace(state: BasicInputState): BasicInputState {
  if (state.error) return INITIAL_BASIC_STATE
  if (state.tokens.length === 0) return state // result already showing — clear it via C instead
  const tokens = [...state.tokens]
  const last = tokens[tokens.length - 1]
  if (last.kind === 'op' || last.text.length <= 1) {
    tokens.pop()
  } else {
    tokens[tokens.length - 1] = { kind: 'num', text: last.text.slice(0, -1) }
  }
  return { tokens, result: null, error: null }
}

export function clearAll(): BasicInputState {
  return INITIAL_BASIC_STATE
}

export function evaluateState(state: BasicInputState): BasicInputState {
  if (state.error || state.tokens.length === 0) return state
  let tokens = state.tokens
  // Drop a dangling trailing operator so "12+" behaves like "12".
  if (tokens[tokens.length - 1].kind === 'op') tokens = tokens.slice(0, -1)
  if (tokens.length === 0) return state
  try {
    const value = evaluate(exprString(tokens))
    return { tokens: [], result: formatResult(value), error: null }
  } catch (err) {
    const message = err instanceof DivisionByZeroError ? 'Division by zero' : 'Error'
    return { tokens: [], result: null, error: message }
  }
}
