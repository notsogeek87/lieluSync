/**
 * Process-wide limiter for outbound TMDB calls: bounded concurrency plus a
 * minimum spacing between request starts. TMDB's documented upper limit is
 * "around 40 requests per second"; we stay well below it per instance.
 */
export class RequestLimiter {
  private active = 0;
  private queue: Array<() => void> = [];
  private nextSlot = 0;

  constructor(
    private readonly maxConcurrent: number,
    private readonly minIntervalMs: number,
  ) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      const now = Date.now();
      const wait = Math.max(0, this.nextSlot - now);
      this.nextSlot = Math.max(now, this.nextSlot) + this.minIntervalMs;
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.queue.push(() => { this.active++; resolve(); }));
  }

  private release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}

/** Run `fn` over `items` with at most `concurrency` in flight; preserves order of results. */
export async function mapConcurrent<T, R>(items: readonly T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}
