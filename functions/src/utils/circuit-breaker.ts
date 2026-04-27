/**
 * Circuit breaker pattern and resilience utilities for external service calls
 * (Gemini, Twilio, Firestore).
 *
 * Requirements: 25.1, 25.2, 25.3, 25.4, 23.1, 23.2
 */

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit breaker "${name}" is open — request rejected`);
    this.name = 'CircuitOpenError';
  }
}

export type CircuitState = 'closed' | 'open' | 'half_open';

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures: number[] = []; // timestamps of failures within the window
  private lastFailureTime = 0;

  constructor(
    public readonly name: string,
    private readonly failureThreshold: number = 5,
    private readonly resetTimeoutMs: number = 30_000,
    private readonly windowMs: number = 60_000,
  ) {}

  /**
   * Wraps an async function with circuit breaker protection.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = 'half_open';
      } else {
        throw new CircuitOpenError(this.name);
      }
    }

    if (this.state === 'half_open') {
      try {
        const result = await fn();
        this.reset();
        return result;
      } catch (err) {
        this.tripOpen();
        throw err;
      }
    }

    // closed state
    try {
      const result = await fn();
      return result;
    } catch (err) {
      this.recordFailure();
      throw err;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  /** Force-reset the breaker to closed. */
  reset(): void {
    this.state = 'closed';
    this.failures = [];
    this.lastFailureTime = 0;
  }

  private recordFailure(): void {
    const now = Date.now();
    this.failures.push(now);
    this.lastFailureTime = now;

    // Prune failures outside the window
    const windowStart = now - this.windowMs;
    this.failures = this.failures.filter((t) => t >= windowStart);

    if (this.failures.length >= this.failureThreshold) {
      this.tripOpen();
    }
  }

  private tripOpen(): void {
    this.state = 'open';
    this.lastFailureTime = Date.now();
  }
}

/**
 * Pure function: computes exponential backoff delay in milliseconds.
 * delay = 5000 * 2^attempt  (5 s, 10 s, 20 s for attempts 0, 1, 2)
 */
export function computeBackoffDelay(attempt: number): number {
  return 5000 * Math.pow(2, attempt);
}

/**
 * Retries `fn` with exponential backoff up to `maxRetries` times.
 * Throws the last error after all retries are exhausted.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = computeBackoffDelay(attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}
