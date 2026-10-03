/**
 * Venice-scoped circuit breaker.
 *
 * Re-exports the generalised `CircuitBreaker` from `../circuitBreaker` with
 * Venice-specific defaults so existing Venice client code continues to work
 * without modification.
 */

export type { CircuitState, CircuitBreakerOptions } from '../circuitBreaker.js';
export { CircuitOpenError } from '../circuitBreaker.js';

import {
  CircuitBreaker as GenericCircuitBreaker,
  type CircuitBreakerOptions as Options,
} from '../circuitBreaker.js';

/**
 * Venice-scoped breaker.
 *
 * The generalised breaker lives in `../circuitBreaker`; this subclass only pins
 * the service name (so the state events and error messages say "venice") and
 * keeps the constructor argument optional, which is how the Venice client and
 * its tests have always constructed it. Thresholds are inherited unchanged:
 * 3 consecutive failures, 60 s before the recovery probe.
 */
export class CircuitBreaker extends GenericCircuitBreaker {
  constructor(options: Partial<Options> = {}) {
    super({ name: 'venice', ...options });
  }
}
