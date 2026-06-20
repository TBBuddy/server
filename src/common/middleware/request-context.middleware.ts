import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(request: Request, response: Response, next: NextFunction): void {
    const incomingRequestId = request.header('x-request-id');
    const requestId =
      incomingRequestId && uuidPattern.test(incomingRequestId)
        ? incomingRequestId
        : randomUUID();

    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);

    const startedAt = Date.now();
    response.on('finish', () => {
      this.logger.log({
        requestId,
        method: request.method,
        path: request.originalUrl,
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });

    next();
  }
}
