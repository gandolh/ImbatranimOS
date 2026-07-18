/**
 * Thrown by both the basic and programmer evaluators on division (or
 * modulo) by zero. Callers catch it and render a non-crashing error state
 * instead of letting NaN/Infinity leak into the display.
 */
export class DivisionByZeroError extends Error {
  constructor() {
    super('Division by zero')
    this.name = 'DivisionByZeroError'
  }
}
