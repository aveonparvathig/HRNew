import { Request, Response, NextFunction } from 'express';

/**
 * Minimal in-memory fixed-window rate limiter (per IP). Good enough for a
 * single-process deployment; swap for a Redis-backed limiter when scaling out.
 */
export function rateLimit({ windowMs, max, message }: {
  windowMs: number;
  max: number;
  message?: string;
}) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  // Keep the map from growing unboundedly.
  setInterval(() => {
    const now = Date.now();
    for (const [key, v] of hits) {
      if (v.resetAt <= now) hits.delete(key);
    }
  }, windowMs).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count++;
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({
        error: message || 'Too many requests. Please try again shortly.',
      });
    }
    next();
  };
}
