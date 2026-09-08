import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Observable } from 'rxjs';

/**
 * FHIR responses are `application/fhir+json`, not plain JSON. A conformant
 * client checks it, and some refuse a body served as `application/json`.
 *
 * An interceptor rather than `@Header` because Nest only accepts that decorator
 * on a method, and repeating it on eighteen routes is eighteen chances to miss
 * one.
 */
@Injectable()
export class FhirContentTypeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    context
      .switchToHttp()
      .getResponse<Response>()
      .setHeader('Content-Type', 'application/fhir+json; charset=utf-8');
    return next.handle();
  }
}
