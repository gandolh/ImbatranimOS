import { DivisionByZeroError } from './errors'

/**
 * Basic-mode tokenizer + shunting-yard evaluator. Deliberately NOT `eval`/
 * `new Function` — every character of the expression is parsed explicitly.
 * Pure functions, unit-testable in isolation from any UI state.
 */

export type OperatorSymbol = '+' | '-' | '*' | '/'

export type Token = { type: 'number'; value: number } | { type: 'operator'; value: OperatorSymbol }

// Accepts both the ASCII operators (keyboard input) and the Win7-classic
// glyphs the on-screen buttons emit (× ÷ −).
const OPERATOR_ALIASES: Record<string, OperatorSymbol> = {
  '+': '+',
  '-': '-',
  '−': '-', // −
  '*': '*',
  '×': '*', // ×
  '/': '/',
  '÷': '/', // ÷
}

const PRECEDENCE: Record<OperatorSymbol, number> = { '+': 1, '-': 1, '*': 2, '/': 2 }

function isDigit(c: string | undefined): boolean {
  return c !== undefined && c >= '0' && c <= '9'
}

function isMinusLike(c: string | undefined): boolean {
  return c === '-' || c === '−'
}

/** Reads a (possibly signed) number literal starting at `start`; returns its end index. */
function readNumber(expr: string, start: number): { value: number; end: number } {
  let i = start
  const signed = isMinusLike(expr[i])
  if (signed) i++
  const digitsStart = i
  let sawDot = false
  while (i < expr.length && (isDigit(expr[i]) || (expr[i] === '.' && !sawDot))) {
    if (expr[i] === '.') sawDot = true
    i++
  }
  if (i === digitsStart) {
    throw new Error(`Expected a number at position ${start}`)
  }
  let value = Number(expr.slice(digitsStart, i))
  if (signed) value = -value
  // Trailing '%' divides the literal by 100, once per '%' typed.
  while (expr[i] === '%') {
    value /= 100
    i++
  }
  return { value, end: i }
}

/**
 * Tokenizes an expression string (e.g. "12+50%×2") into numbers and
 * operators. Supports unary minus at the start of the expression or right
 * after another operator, so double-minus ("5−−3") reads as subtracting a
 * negative — same convention real calculators use.
 */
export function tokenize(expr: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < expr.length) {
    const ch = expr[i]

    if (ch === ' ') {
      i++
      continue
    }

    const atExpressionStart = tokens.length === 0
    const afterOperator = tokens[tokens.length - 1]?.type === 'operator'

    if (isDigit(ch) || ch === '.' || (isMinusLike(ch) && (atExpressionStart || afterOperator))) {
      const { value, end } = readNumber(expr, i)
      tokens.push({ type: 'number', value })
      i = end
      continue
    }

    const op = OPERATOR_ALIASES[ch]
    if (op) {
      tokens.push({ type: 'operator', value: op })
      i++
      continue
    }

    throw new Error(`Unexpected character '${ch}' at position ${i}`)
  }

  return tokens
}

/** Shunting-yard: infix tokens -> RPN (left-associative; no parentheses needed here). */
export function toRPN(tokens: Token[]): Token[] {
  const output: Token[] = []
  const opStack: Token[] = []

  for (const token of tokens) {
    if (token.type === 'number') {
      output.push(token)
      continue
    }
    while (opStack.length > 0) {
      const top = opStack[opStack.length - 1]
      if (top.type !== 'operator' || PRECEDENCE[top.value] < PRECEDENCE[token.value]) break
      output.push(opStack.pop() as Token)
    }
    opStack.push(token)
  }
  while (opStack.length > 0) output.push(opStack.pop() as Token)
  return output
}

export function evaluateRPN(rpn: Token[]): number {
  const stack: number[] = []
  for (const token of rpn) {
    if (token.type === 'number') {
      stack.push(token.value)
      continue
    }
    const b = stack.pop()
    const a = stack.pop()
    if (a === undefined || b === undefined) {
      throw new Error('Malformed expression')
    }
    switch (token.value) {
      case '+':
        stack.push(a + b)
        break
      case '-':
        stack.push(a - b)
        break
      case '*':
        stack.push(a * b)
        break
      case '/':
        if (b === 0) throw new DivisionByZeroError()
        stack.push(a / b)
        break
    }
  }
  if (stack.length !== 1) throw new Error('Malformed expression')
  return stack[0]
}

/** Tokenize -> shunting-yard -> evaluate, respecting standard `× ÷` over `+ −` precedence. */
export function evaluate(expr: string): number {
  const tokens = tokenize(expr)
  if (tokens.length === 0) return 0
  return evaluateRPN(toRPN(tokens))
}

/**
 * Formats a numeric result for display: rounds to 12 significant digits so
 * binary float noise (e.g. 0.1 + 0.2 -> 0.30000000000000004) doesn't leak
 * into the UI, then lets `toString` trim the trailing zeros.
 */
export function formatResult(n: number): string {
  if (!Number.isFinite(n)) return 'Error'
  if (n === 0) return '0'
  return Number(n.toPrecision(12)).toString()
}
