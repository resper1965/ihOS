// Rate-limit governor for Standard GRC syncs.
//
// Measured 2026-08-27: the API reports `x-ratelimit-limit: 120` and
// `x-ratelimit-reset: 60`. A full crosswalk walk is ~1,468 requests, so every
// sync in src/lib/standard-api/sync/ goes through here. A sync that discovers
// the limit by being rejected has already lost its place in a 13-minute walk.

export interface Throttle {
  /** Acquire a slot, then run `fn`. Retries once on a 429 that names a delay. */
  run<T>(fn: () => Promise<T>): Promise<T>;
  /**
   * Report the server's `x-ratelimit-remaining`. The server's count is
   * authoritative over our local window arithmetic — call this after any
   * response that carries the header.
   */
  observeRemaining(remaining: number): void;
}

export interface ThrottleOptions {
  /**
   * Requests permitted per window. Defaults to 110 rather than the measured
   * 120: the app makes other calls against the same key, and a sync that
   * consumes the entire budget starves them.
   */
  perWindow?: number;
  windowMs?: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function retryDelayOf(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null;
  const e = err as { status?: number; retryAfterMs?: number };
  if (e.status !== 429) return null;
  return typeof e.retryAfterMs === 'number' && e.retryAfterMs >= 0 ? e.retryAfterMs : 1000;
}

export function createThrottle(opts: ThrottleOptions = {}): Throttle {
  const perWindow = opts.perWindow ?? 110;
  const windowMs = opts.windowMs ?? 60_000;

  // Timestamps of granted slots, oldest first. A sliding window, not fixed
  // blocks: the third request waits until the *first* ages out, which is what
  // the server's own reset semantics imply.
  const granted: number[] = [];

  // Set when the server tells us it has nothing left. Cleared once the window
  // has necessarily rolled over.
  let serverExhaustedUntil = 0;

  // Acquisition is serialised so concurrent callers cannot each see room and
  // over-admit. Only acquisition holds the lock — the requests themselves run
  // concurrently, up to the budget.
  let lock: Promise<unknown> = Promise.resolve();

  function prune(now: number): void {
    while (granted.length > 0 && now - granted[0] >= windowMs) granted.shift();
  }

  async function acquire(): Promise<void> {
    for (;;) {
      const now = Date.now();
      prune(now);

      if (serverExhaustedUntil > now) {
        await sleep(serverExhaustedUntil - now);
        continue;
      }

      if (granted.length < perWindow) {
        granted.push(now);
        return;
      }

      await sleep(Math.max(windowMs - (now - granted[0]), 1));
    }
  }

  function withLock<T>(fn: () => Promise<T>): Promise<T> {
    const result = lock.then(fn, fn);
    lock = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      await withLock(acquire);
      try {
        return await fn();
      } catch (err) {
        const delay = retryDelayOf(err);
        if (delay === null) throw err;
        // One retry, not a loop. A persistent 429 is a signal to stop and look,
        // not to keep knocking — and the caller's resume path exists for that.
        await sleep(delay);
        await withLock(acquire);
        return await fn();
      }
    },

    observeRemaining(remaining: number): void {
      if (remaining > 0) return;
      // The server says nothing is left. Hold until the window must have
      // rolled, regardless of what our local count believes.
      serverExhaustedUntil = Date.now() + windowMs;
    },
  };
}
