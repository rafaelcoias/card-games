/** Classic token bucket: `capacity` burst, refilled at `refillPerSecond`. */
export class TokenBucket {
  private tokens: number;
  private updatedAt: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.updatedAt = now();
  }

  tryTake(): boolean {
    const current = this.now();
    const elapsed = (current - this.updatedAt) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSecond);
    this.updatedAt = current;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

export interface SocketRateLimits {
  general: TokenBucket;
  chat: TokenBucket;
}

export function createSocketRateLimits(now?: () => number): SocketRateLimits {
  return {
    general: new TokenBucket(30, 15, now),
    chat: new TokenBucket(5, 1, now),
  };
}
