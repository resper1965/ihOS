import { describe, it, expect, vi, afterEach } from 'vitest';
import { createThrottle } from '@/lib/standard-api/sync/throttle';

afterEach(() => {
  vi.useRealTimers();
});

describe('the throttle respects a per-window budget', () => {
  it('serialises past the budget instead of bursting through it', async () => {
    vi.useFakeTimers();
    const t = createThrottle({ perWindow: 3, windowMs: 1000 });
    const done: number[] = [];

    const calls = Array.from({ length: 5 }, (_, i) =>
      t.run(async () => {
        done.push(i);
        return i;
      }),
    );

    // Let every microtask settle without advancing the clock. Exactly the
    // budget should have run; the rest must be holding.
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toHaveLength(3);

    await vi.advanceTimersByTimeAsync(1000);
    await expect(Promise.all(calls)).resolves.toEqual([0, 1, 2, 3, 4]);
    expect(done).toHaveLength(5);
  });

  it('lets the window slide rather than resetting in fixed blocks', async () => {
    vi.useFakeTimers();
    const t = createThrottle({ perWindow: 2, windowMs: 1000 });
    const at: number[] = [];
    const stamp = () => t.run(async () => { at.push(Date.now()); });

    const a = stamp();
    const b = stamp();
    await vi.advanceTimersByTimeAsync(0);
    expect(at).toHaveLength(2);

    // Third call must wait until the FIRST stamp ages out — 1000ms after it,
    // not 1000ms after some fixed block boundary.
    const c = stamp();
    await vi.advanceTimersByTimeAsync(999);
    expect(at).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2);
    expect(at).toHaveLength(3);

    await Promise.all([a, b, c]);
  });
});

describe('the throttle defers to the server over its own arithmetic', () => {
  it('honours a retryAfterMs carried on a 429 and retries once', async () => {
    // Our window accounting only approximates the server's. Where the server
    // contradicts it, the server is right.
    const t = createThrottle({ perWindow: 100, windowMs: 60_000 });
    let attempts = 0;

    const result = await t.run(async () => {
      attempts++;
      if (attempts === 1) {
        const e = new Error('429') as Error & { status?: number; retryAfterMs?: number };
        e.status = 429;
        e.retryAfterMs = 1;
        throw e;
      }
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });

  it('gives up after one retry rather than looping on a persistent 429', async () => {
    const t = createThrottle({ perWindow: 100, windowMs: 60_000 });
    let attempts = 0;

    await expect(
      t.run(async () => {
        attempts++;
        const e = new Error('still limited') as Error & { status?: number; retryAfterMs?: number };
        e.status = 429;
        e.retryAfterMs = 1;
        throw e;
      }),
    ).rejects.toThrow(/still limited/);

    expect(attempts).toBe(2);
  });

  it('does not retry an error that is not a 429', async () => {
    const t = createThrottle({ perWindow: 100, windowMs: 60_000 });
    let attempts = 0;

    await expect(
      t.run(async () => {
        attempts++;
        const e = new Error('bad request') as Error & { status?: number };
        e.status = 400;
        throw e;
      }),
    ).rejects.toThrow(/bad request/);

    expect(attempts).toBe(1);
  });

  it('narrows its own window when the server reports fewer remaining', async () => {
    // x-ratelimit-remaining is authoritative. If the server says 0 remain, the
    // next acquire must wait even though our local count thinks there is room.
    vi.useFakeTimers();
    const t = createThrottle({ perWindow: 100, windowMs: 1000 });
    const done: string[] = [];

    await t.run(async () => { done.push('first'); });
    t.observeRemaining(0);

    const held = t.run(async () => { done.push('second'); });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toEqual(['first']);

    await vi.advanceTimersByTimeAsync(1000);
    await held;
    expect(done).toEqual(['first', 'second']);
  });
});
