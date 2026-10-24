import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { randomUUID } from 'crypto';
import { config } from '../config/env';

export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  error: Error | AppError | ZodError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: error.message,
      status: error.statusCode,
    });
  }

  if (error instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation error',
      details: error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
      status: 400,
    });
  }

  // Client errors raised by Express itself (malformed JSON, oversized body)
  // carry their own status and a message that is safe to show.
  const http = error as { status?: number; expose?: boolean };
  if (typeof http.status === 'number' && http.status >= 400 && http.status < 500 && http.expose) {
    return res.status(http.status).json({ error: error.message, status: http.status });
  }

  // Anything else is unexpected: its message may carry SQL or internals, so
  // outside development the client gets a reference to quote, never the text.
  const errorId = randomUUID().slice(0, 8);
  console.error(`Error ${errorId} on ${req.method} ${req.originalUrl}:`, error);
  return res.status(500).json({
    error: config.isDevelopment() ? error.message : 'Something went wrong. Please try again.',
    errorId,
    status: 500,
  });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: `Route ${req.originalUrl} not found`,
    status: 404,
  });
}
