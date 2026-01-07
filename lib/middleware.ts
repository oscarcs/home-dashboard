import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import type { Request, Response, NextFunction, Application, RequestHandler } from 'express';

/**
 * Security headers middleware using Helmet
 * Relaxed config for local-only dashboard
 */
export function securityHeaders(): RequestHandler {
  return helmet({
    contentSecurityPolicy: false, // Disabled for local dashboard
    crossOriginResourcePolicy: false,
    hsts: false, // Local dashboard - HTTP is fine
  });
}

/**
 * Correlation ID and request timing middleware
 */
export function correlationAndTiming(req: Request, res: Response, next: NextFunction): void {
  const corrId = (req.headers['x-correlation-id'] as string) || uuidv4();
  res.locals.corrId = corrId;
  res.setHeader('X-Correlation-Id', corrId);

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1e6;
    console.log(`[${corrId}] ${req.method} ${req.originalUrl} -> ${res.statusCode} in ${ms.toFixed(1)}ms`);
  });

  // Safety timeout on responses
  res.setTimeout(60_000, () => {
    console.warn(`[${corrId}] Response timeout`);
    try {
      res.status(504).json({ error: 'Gateway Timeout' });
    } catch (_) {}
  });

  next();
}

/**
 * Prevent caching for polling clients
 */
export function noCacheHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
}

/**
 * Rate limiting middleware
 */
export function rateLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: { error: 'Too many requests' }
  });
}

/**
 * Apply all standard middleware to Express app
 */
export function applyMiddleware(app: Application): void {
  app.use(morgan('dev'));
  app.use(securityHeaders());
  app.use(correlationAndTiming);
  app.use(rateLimiter());
  app.use(noCacheHeaders);
}
