/**
 * Generic circuit breaker for external service calls.
 *
 * States:
 *   CLOSED    — normal operation, requests pass through.
 *   OPEN      — service is failing, requests are blocked immediately.
 *   HALF_OPEN — recovery probe: one request is allowed through to test
 *               whether the service has recovered.
 *
 * Transitions:
 *   CLOSED → OPEN      after `failureThreshold` consecutive failures.
 *   OPEN   → HALF_OPEN after `recoveryTimeoutMs` has elapsed.
 *   HALF_OPEN → CLOSED on the next successful call.
 *   HALF_OPEN → OPEN   on the next failed call (resets the timeout).
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Service name — used in event payloads and error messages. */
  name: string;
  /** Consecutive failures before the circuit opens (default: 3). */
  failureThreshold?: number;
  /** Milliseconds to wait before probing for recovery (default: 60 000). */
  recoveryTimeoutMs?: number;
  /** Injectable clock — useful for deterministic tests. */
  nowFn?: () => number;
  /** Optional event listener invoked on state transitions. */
  onStateChange?: (event: CircuitBreakerEvent) => void;
}

export interface CircuitBreakerEvent {
  name: string;
  from: CircuitState;
  to: CircuitState;
  timestamp: number;
}

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit breaker OPEN for service: ${name}`);
    this.name = 'CircuitOpenError';
  }
}

export class CircuitBreaker {
  readonly name: string;
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private openedAt = 0;
  private readonly failureThreshold: number;
  private readonly recoveryTimeoutMs: number;
  private readonly nowFn: () => number;
  private readonly onStateChange?: (event: CircuitBreakerEvent) => void;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 3;
    this.recoveryTimeoutMs = options.recoveryTimeoutMs ?? 60_000;
    this.nowFn = options.nowFn ?? (() => Date.now());
    this.onStateChange = options.onStateChange;
  }

  /** Current state, accounting for elapsed recovery timeout. */
  getState(): CircuitState {
    this.evaluateTimeout();
    return this.state;
  }

  getFailureCount(): number {
    return this.failures;
  }

  /**
   * Throws `CircuitOpenError` when the circuit is OPEN.
   * Call this before attempting a request.
   */
  assertClosed(): void {
    this.evaluateTimeout();
    if (this.state === 'OPEN') {
      throw new CircuitOpenError(this.name);
    }
  }

  /**
   * Execute `fn` through the circuit breaker.
   * Automatically records success/failure and returns the result.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.assertClosed();
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      this.recordFailure();
      throw err;
    }
  }

  recordSuccess(): void {
    const prev = this.state;
    this.failures = 0;
    this.state = 'CLOSED';
    if (prev !== 'CLOSED') {
      this.emit(prev, 'CLOSED');
    }
  }

  recordFailure(): void {
    this.failures++;
    if (this.failures >= this.failureThreshold) {
      const prev = this.state;
      this.state = 'OPEN';
      this.openedAt = this.nowFn();
      if (prev !== 'OPEN') {
        this.emit(prev, 'OPEN');
      }
    }
  }

  /** Serialisable status snapshot for health endpoints. */
  getStatus(): {
    name: string;
    state: CircuitState;
    failures: number;
    failureThreshold: number;
    recoveryTimeoutMs: number;
    openedAt: number | null;
  } {
    this.evaluateTimeout();
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      failureThreshold: this.failureThreshold,
      recoveryTimeoutMs: this.recoveryTimeoutMs,
      openedAt: this.state !== 'CLOSED' ? this.openedAt : null,
    };
  }

  // ── private ──────────────────────────────────────────────────────────────

  private evaluateTimeout(): void {
    if (this.state === 'OPEN') {
      const elapsed = this.nowFn() - this.openedAt;
      if (elapsed >= this.recoveryTimeoutMs) {
        this.transition('OPEN', 'HALF_OPEN');
      }
    }
  }

  private transition(from: CircuitState, to: CircuitState): void {
    this.state = to;
    this.emit(from, to);
  }

  private emit(from: CircuitState, to: CircuitState): void {
    this.onStateChange?.({ name: this.name, from, to, timestamp: this.nowFn() });
  }
}

// ── Registry — singleton map of named breakers ────────────────────────────────

const registry = new Map<string, CircuitBreaker>();

/**
 * Get or create a named circuit breaker.
 * Options are only applied on first creation; subsequent calls return the
 * cached instance.
 */
export function getCircuitBreaker(options: CircuitBreakerOptions): CircuitBreaker {
  const existing = registry.get(options.name);
  if (existing) return existing;
  const breaker = new CircuitBreaker(options);
  registry.set(options.name, breaker);
  return breaker;
}

/** Return status snapshots for all registered circuit breakers. */
export function getAllCircuitBreakerStatuses(): ReturnType<CircuitBreaker['getStatus']>[] {
  return Array.from(registry.values()).map((b) => b.getStatus());
}

/** Remove all registered breakers — intended for tests only. */
export function _resetCircuitBreakerRegistry(): void {
  registry.clear();
}
