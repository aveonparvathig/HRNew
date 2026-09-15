import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

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
  console.error('Error:', error);

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

  // Default error
  return res.status(500).json({
    error: error instanceof Error ? error.message : 'Internal server error',
    status: 500,
  });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: `Route ${req.originalUrl} not found`,
    status: 404,
  });
}
