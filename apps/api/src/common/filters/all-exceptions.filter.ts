import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = 500;
    let body: Record<string, unknown> = { message: 'Internal server error' };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      body =
        typeof response === 'string'
          ? { message: response }
          : (response as Record<string, unknown>);
    } else if (exception instanceof Error) {
      this.logger.error(exception.stack ?? exception.message);
    }

    res.status(status).json({
      statusCode: status,
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
      ...body,
    });
  }
}
