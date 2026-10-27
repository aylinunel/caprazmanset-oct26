import { createHash } from "node:crypto";

export class RateLimiter {
  private readonly hits = new Map<string, { count: number; until: number }>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly capacity = 10000
  ) {}
  accept(identity: string, now = Date.now()): boolean {
    const key = createHash("sha256").update(identity).digest("hex");
    let value = this.hits.get(key);
    if (!value || value.until <= now) {
      if (this.hits.size >= this.capacity) {
        for (const [entry, state] of this.hits)
          if (state.until <= now) this.hits.delete(entry);
        if (this.hits.size >= this.capacity) return false;
      }
      value = { count: 0, until: now + this.windowMs };
      this.hits.set(key, value);
    }
    value.count += 1;
    return value.count <= this.limit;
  }
}
