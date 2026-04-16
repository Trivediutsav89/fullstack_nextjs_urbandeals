/**
 * Rate Limiting Middleware for Urban Deals Shop API Routes
 * Provides protection against brute force and excessive requests
 */

import type { NextRequest, NextResponse } from "next/server";

/**
 * Rate limiter configuration
 */
export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
  keyGenerator?: (req: NextRequest) => string; // Custom key generator
}

/**
 * Rate limiter store (in-memory for simplicity, use Redis for production)
 */
interface RequestRecord {
  count: number;
  resetTime: number;
}

class RateLimiterStore {
  private store = new Map<string, RequestRecord>();
  private cleanupInterval: NodeJS.Timer | null = null;

  constructor() {
    // Cleanup expired entries every minute
    if (typeof globalThis !== "undefined" && !this.cleanupInterval) {
      this.cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [key, record] of this.store.entries()) {
          if (record.resetTime < now) {
            this.store.delete(key);
          }
        }
      }, 60000);
    }
  }

  get(key: string): RequestRecord | undefined {
    const record = this.store.get(key);
    if (record && record.resetTime < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return record;
  }

  increment(key: string, windowMs: number): number {
    const now = Date.now();
    const record = this.get(key);

    if (record) {
      record.count++;
      return record.count;
    }

    this.store.set(key, {
      count: 1,
      resetTime: now + windowMs,
    });

    return 1;
  }

  reset(key: string): void {
    this.store.delete(key);
  }
}

// Singleton instance
const globalStore = new RateLimiterStore();

/**
 * Extract client IP from request
 */
function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0] : req.ip || "unknown";
  return ip.trim();
}

/**
 * Default rate limiting configuration
 */
export const DEFAULT_RATE_LIMITS = {
  /**
   * General API rate limit: 100 requests per 15 minutes
   */
  general: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 100,
  },

  /**
   * Strict rate limit for auth endpoints: 5 requests per 15 minutes
   */
  auth: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 5,
  },

  /**
   * Moderate rate limit for payment endpoints: 10 requests per 15 minutes
   */
  payment: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 10,
  },

  /**
   * Upload rate limit: 20 requests per hour
   */
  upload: {
    windowMs: 60 * 60 * 1000,
    maxRequests: 20,
  },

  /**
   * Loose rate limit for public endpoints: 200 requests per minute
   */
  public: {
    windowMs: 60 * 1000,
    maxRequests: 200,
  },
};

/**
 * Rate limiting middleware
 */
export function createRateLimiter(config: RateLimitConfig) {
  const {
    windowMs,
    maxRequests,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    keyGenerator = (req) => getClientIp(req),
  } = config;

  return async (
    req: NextRequest,
  ): Promise<{ allowed: boolean; remaining: number; retryAfter?: number }> => {
    const key = keyGenerator(req);
    const count = globalStore.increment(key, windowMs);

    if (count > maxRequests) {
      const retryAfterSeconds = Math.ceil(windowMs / 1000);
      return {
        allowed: false,
        remaining: 0,
        retryAfter: retryAfterSeconds,
      };
    }

    return {
      allowed: true,
      remaining: maxRequests - count,
    };
  };
}

/**
 * Response wrapper for rate limited API routes
 */
export function generateRateLimitHeaders(
  remaining: number,
  limit: number,
  retryAfter?: number,
): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": limit.toString(),
    "X-RateLimit-Remaining": Math.max(0, remaining).toString(),
  };

  if (retryAfter) {
    headers["Retry-After"] = retryAfter.toString();
  }

  return headers;
}

/**
 * Enhanced rate limit response
 */
export function createRateLimitErrorResponse(retryAfter: number) {
  return new Response(
    JSON.stringify({
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests. Please try again later.",
        retryAfter,
      },
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": retryAfter.toString(),
        "X-Rate-Limit-Exceeded": "true",
      },
    },
  );
}

/**
 * Per-route rate limiter factory
 */
export const rateLimiters = {
  /**
   * Auth routes: 5 attempts per 15 minutes per IP
   */
  auth: createRateLimiter(DEFAULT_RATE_LIMITS.auth),

  /**
   * Payment routes: 10 requests per 15 minutes per IP
   */
  payment: createRateLimiter(DEFAULT_RATE_LIMITS.payment),

  /**
   * Upload routes: 20 requests per hour per user ID
   */
  upload: createRateLimiter({
    ...DEFAULT_RATE_LIMITS.upload,
    keyGenerator: (req) => req.headers.get("user-id") || getClientIp(req),
  }),

  /**
   * General API routes: 100 requests per 15 minutes per IP
   */
  general: createRateLimiter(DEFAULT_RATE_LIMITS.general),

  /**
   * Public routes: 200 requests per minute per IP
   */
  public: createRateLimiter(DEFAULT_RATE_LIMITS.public),
};

/**
 * Middleware wrapper for using in route handler
 */
export async function withRateLimit(
  req: NextRequest,
  limiter: Awaited<ReturnType<typeof createRateLimiter>>,
  handler: (req: NextRequest) => Promise<Response>,
): Promise<Response> {
  const limit = await limiter(req);

  if (!limit.allowed) {
    return createRateLimitErrorResponse(limit.retryAfter || 60);
  }

  // Generate headers
  const headers = generateRateLimitHeaders(limit.remaining, 100, undefined);

  try {
    const response = await handler(req);
    
    // Add rate limit headers to response
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    console.error("[Rate Limit Middleware] Error:", error);
    throw error;
  }
}

/**
 * Reset rate limit for a specific key (useful for testing)
 */
export function resetRateLimit(key: string): void {
  globalStore.reset(key);
}

/**
 * Example usage in a route handler:
 *
 * export async function POST(req: NextRequest) {
 *   return withRateLimit(req, rateLimiters.auth, async (req) => {
 *     // Your route logic here
 *     return new Response(JSON.stringify({ success: true }), {
 *       status: 200,
 *       headers: { "Content-Type": "application/json" },
 *     });
 *   });
 * }
 */
