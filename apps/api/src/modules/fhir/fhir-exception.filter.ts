import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { OperationOutcome } from './fhir.types.js';

/**
 * FHIR errors are OperationOutcome resources, not our house error shape.
 *
 * A client written against FHIR parses the body as a resource. Handing it our
 * generic `{statusCode, message}` gives it something it cannot read at exactly
 * the moment it most needs to know what went wrong.
 */
@Catch()
export class FhirExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Fhir');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Never leak an internal message. A 500 says so and nothing more; the
    // detail goes to the log, where it belongs.
    let diagnostics: string;
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      diagnostics =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message as string) ??
            exception.message;
      if (Array.isArray(diagnostics)) diagnostics = diagnostics.join('; ');
    } else {
      this.logger.error(String(exception));
      diagnostics = 'Internal server error';
    }

    const outcome: OperationOutcome = {
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: status >= 500 ? 'fatal' : 'error',
          code: CODE_BY_STATUS[status] ?? 'processing',
          diagnostics,
        },
      ],
    };

    res
      .status(status)
      .type('application/fhir+json')
      .json(outcome);
  }
}

/** FHIR's own issue-type codes, which are not HTTP statuses. */
const CODE_BY_STATUS: Record<number, string> = {
  400: 'invalid',
  401: 'login',
  403: 'forbidden',
  404: 'not-found',
  405: 'not-supported',
  409: 'conflict',
  422: 'processing',
  429: 'throttled',
  500: 'exception',
};
