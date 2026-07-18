import { DivisionByZeroError } from './errors'

/**
 * Programmer-mode arithmetic. Everything runs on `bigint` and is masked to
 * an unsigned 64-bit word after every op, so shifts/masks/base conversions
 * never lose precision the way `number` (53-bit safe integers) would.
 */

export type Base = 2 | 8 | 10 | 16

export const MASK64 = (1n << 64n) - 1n

/** Wraps a bigint into the unsigned 64-bit range (two's-complement wraparound). */
export function clamp64(value: bigint): bigint {
  return value & MASK64
}

const DIGITS_FOR_BASE: Record<Base, string> = {
  2: '01',
  8: '01234567',
  10: '0123456789',
  16: '0123456789ABCDEF',
}

/** The button-enabled digit set for a given base (e.g. HEX includes A–F). */
export function validDigitsForBase(base: Base): string[] {
  return DIGITS_FOR_BASE[base].split('')
}

function basePrefix(base: Base): string {
  switch (base) {
    case 16:
      return '0x'
    case 8:
      return '0o'
    case 2:
      return '0b'
    case 10:
      return ''
  }
}

/** Parses a string of digits (no sign) in `base` into a clamped 64-bit bigint. */
export function parseInBase(input: string, base: Base): bigint {
  const clean = input.trim()
  if (clean === '') return 0n
  return clamp64(BigInt(basePrefix(base) + clean))
}

/** Renders a bigint back into `base`'s digit string (uppercase for hex). */
export function formatInBase(value: bigint, base: Base): string {
  return clamp64(value).toString(base).toUpperCase()
}

export function bitAnd(a: bigint, b: bigint): bigint {
  return clamp64(a & b)
}

export function bitOr(a: bigint, b: bigint): bigint {
  return clamp64(a | b)
}

export function bitXor(a: bigint, b: bigint): bigint {
  return clamp64(a ^ b)
}

export function bitNot(a: bigint): bigint {
  return clamp64(~a)
}

/** Shift amounts are taken mod 64 — shifting a 64-bit word by >= 64 is a no-op/zero. */
export function shiftLeft(a: bigint, amount: bigint): bigint {
  return clamp64(clamp64(a) << (amount & 63n))
}

export function shiftRight(a: bigint, amount: bigint): bigint {
  return clamp64(clamp64(a) >> (amount & 63n))
}

export function addP(a: bigint, b: bigint): bigint {
  return clamp64(a + b)
}

export function subP(a: bigint, b: bigint): bigint {
  return clamp64(a - b)
}

export function mulP(a: bigint, b: bigint): bigint {
  return clamp64(a * b)
}

export function divP(a: bigint, b: bigint): bigint {
  if (b === 0n) throw new DivisionByZeroError()
  return clamp64(a / b)
}
