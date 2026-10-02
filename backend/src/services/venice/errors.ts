/**
 * The breaker throws the shared `CircuitOpenError` defined next to the breaker
 * itself. Re-exporting it here keeps a single source of truth — Venice modules
 * and `BaseAgent` all run `instanceof CircuitOpenError` against the error the
 * breaker actually throws.
 */
export { CircuitOpenError } from '../circuitBreaker.js';

/** Thrown when a request asks for more tokens than the hard cap allows. */
export class TokenBudgetExceededError extends Error {
  constructor(requested: number, cap: number) {
    super(`Token budget exceeded: requested ${requested}, hard cap is ${cap}`);
    this.name = 'TokenBudgetExceededError';
  }
}

/**
 * An upstream HTTP status returned by Venice.
 *
 * The status is carried on the error so the retry/failover decision can be made
 * from the code rather than by sniffing the message text. That distinction
 * matters because 401 and the other non-retryable statuses deliberately share a
 * message prefix while needing opposite treatment: a 401 may succeed against a
 * fallback provider holding a different key, whereas a 400/422 means the
 * provider rejected the request itself and no other provider will do better.
 */
export class VeniceStatusError extends Error {
  readonly status: number;

  constructor(status: number, message?: string) {
    super(message ?? `Venice returned status: ${status}`);
    this.name = 'VeniceStatusError';
    this.status = status;
  }
}
