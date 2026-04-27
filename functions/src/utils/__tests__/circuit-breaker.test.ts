import {
  CircuitBreaker,
  CircuitOpenError,
  computeBackoffDelay,
  retryWithBackoff,
} from '../circuit-breaker';

// ---------------------------------------------------------------------------
// CircuitBreaker
// ---------------------------------------------------------------------------

describe('CircuitBreaker', () => {
  it('closed state passes through successful calls', async () => {
    const cb = new CircuitBreaker('test');
    const result = await cb.execute(() => Promise.resolve(42));
    expect(result).toBe(42);
    expect(cb.getState()).toBe('closed');
  });

  it('transitions to open after threshold failures within the window', async () => {
    const cb = new CircuitBreaker('test', 3, 30_000, 60_000);

    for (let i = 0; i < 3; i++) {
      await expect(
        cb.execute(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow('fail');
    }

    expect(cb.getState()).toBe('open');
  });

  it('open state rejects immediately without calling fn', async () => {
    const cb = new CircuitBreaker('test', 1, 30_000, 60_000);

    // Trip the breaker
    await expect(
      cb.execute(() => Promise.reject(new Error('fail'))),
    ).rejects.toThrow('fail');
    expect(cb.getState()).toBe('open');

    const fn = jest.fn();
    await expect(cb.execute(fn)).rejects.toThrow(CircuitOpenError);
    expect(fn).not.toHaveBeenCalled();
  });

  it('transitions to half_open after resetTimeout elapses', async () => {
    const cb = new CircuitBreaker('test', 1, 50, 60_000);

    // Trip the breaker
    await expect(
      cb.execute(() => Promise.reject(new Error('fail'))),
    ).rejects.toThrow();
    expect(cb.getState()).toBe('open');

    // Wait for reset timeout
    await new Promise((r) => setTimeout(r, 60));

    // Next call should be allowed (half_open test call)
    const result = await cb.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
    expect(cb.getState()).toBe('closed');
  });

  it('half_open: successful test call closes the circuit', async () => {
    const cb = new CircuitBreaker('test', 1, 50, 60_000);

    await expect(
      cb.execute(() => Promise.reject(new Error('fail'))),
    ).rejects.toThrow();
    expect(cb.getState()).toBe('open');

    await new Promise((r) => setTimeout(r, 60));

    await cb.execute(() => Promise.resolve('recovered'));
    expect(cb.getState()).toBe('closed');
  });

  it('half_open: failed test call reopens the circuit', async () => {
    const cb = new CircuitBreaker('test', 1, 50, 60_000);

    await expect(
      cb.execute(() => Promise.reject(new Error('fail'))),
    ).rejects.toThrow();
    expect(cb.getState()).toBe('open');

    await new Promise((r) => setTimeout(r, 60));

    await expect(
      cb.execute(() => Promise.reject(new Error('still broken'))),
    ).rejects.toThrow('still broken');
    expect(cb.getState()).toBe('open');
  });

  it('reset() forces the circuit back to closed', async () => {
    const cb = new CircuitBreaker('test', 1, 30_000, 60_000);

    await expect(
      cb.execute(() => Promise.reject(new Error('fail'))),
    ).rejects.toThrow();
    expect(cb.getState()).toBe('open');

    cb.reset();
    expect(cb.getState()).toBe('closed');

    const result = await cb.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
  });

  it('does not trip if failures are below threshold', async () => {
    const cb = new CircuitBreaker('test', 5, 30_000, 60_000);

    for (let i = 0; i < 4; i++) {
      await expect(
        cb.execute(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow();
    }

    expect(cb.getState()).toBe('closed');
  });
});

// ---------------------------------------------------------------------------
// computeBackoffDelay
// ---------------------------------------------------------------------------

describe('computeBackoffDelay', () => {
  it('returns 5000 ms for attempt 0', () => {
    expect(computeBackoffDelay(0)).toBe(5000);
  });

  it('returns 10000 ms for attempt 1', () => {
    expect(computeBackoffDelay(1)).toBe(10_000);
  });

  it('returns 20000 ms for attempt 2', () => {
    expect(computeBackoffDelay(2)).toBe(20_000);
  });

  it('follows 5000 * 2^attempt pattern', () => {
    for (let n = 0; n < 5; n++) {
      expect(computeBackoffDelay(n)).toBe(5000 * Math.pow(2, n));
    }
  });
});

// ---------------------------------------------------------------------------
// retryWithBackoff
// ---------------------------------------------------------------------------

describe('retryWithBackoff', () => {
  it('returns immediately on first success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await retryWithBackoff(fn, 0);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries the correct number of times before throwing', async () => {
    // Use maxRetries=0 so there are no delays to wait for (1 initial call only)
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    await expect(retryWithBackoff(fn, 0)).rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(1);

    // With maxRetries=2 — use a custom wrapper that tracks calls without real delays
    let callCount = 0;
    const fnTracked = jest.fn(async () => {
      callCount++;
      throw new Error('fail');
    });

    // Monkey-patch setTimeout to fire immediately for this test
    const origSetTimeout = global.setTimeout;
    global.setTimeout = ((cb: () => void) => origSetTimeout(cb, 0)) as any;

    await expect(retryWithBackoff(fnTracked, 2)).rejects.toThrow('fail');
    // 1 initial + 2 retries = 3 total calls
    expect(fnTracked).toHaveBeenCalledTimes(3);

    global.setTimeout = origSetTimeout;
  });

  it('succeeds on a retry after initial failures', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('recovered');

    const origSetTimeout = global.setTimeout;
    global.setTimeout = ((cb: () => void) => origSetTimeout(cb, 0)) as any;

    const result = await retryWithBackoff(fn, 3);
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);

    global.setTimeout = origSetTimeout;
  });
});
