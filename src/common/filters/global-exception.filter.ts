import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { MongoServerError } from 'mongodb';
import { MongoloquentException } from 'mongoloquent';
import { Request, Response } from 'express';
import { AppException } from '../exceptions/app.exception';
import {
  ApiErrorDetail,
  ApiErrorResponse,
} from '../interfaces/api-error.interface';

interface NormalizedException {
  statusCode: number;
  code: string;
  message: string;
  errors: ApiErrorDetail[];
}

@Catch()
@Injectable()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();

    if (response.headersSent) {
      return;
    }

    const normalized = this.normalize(exception);
    const requestId = request.requestId;
    const payload: ApiErrorResponse = {
      ...normalized,
      path: request.originalUrl,
      method: request.method,
      timestamp: new Date().toISOString(),
      requestId,
    };

    const logContext = {
      requestId,
      method: request.method,
      path: request.originalUrl,
      statusCode: normalized.statusCode,
      code: normalized.code,
    };

    if (normalized.statusCode >= 500) {
      this.logger.error(
        logContext,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(logContext);
    }

    if (requestId !== undefined) {
      response.setHeader('x-request-id', requestId);
    }
    response.status(normalized.statusCode).json(payload);
  }

  private normalize(exception: unknown): NormalizedException {
    if (exception instanceof AppException) {
      return {
        statusCode: exception.statusCode,
        code: exception.code,
        message: exception.message,
        errors: exception.errors,
      };
    }

    const databaseError: unknown =
      exception instanceof MongoloquentException
        ? (exception.error as unknown)
        : exception;
    if (
      databaseError instanceof MongoServerError &&
      databaseError.code === 11000
    ) {
      return {
        statusCode: 409,
        code: 'RESOURCE_ALREADY_EXISTS',
        message: 'Data dengan identitas tersebut sudah tersedia.',
        errors: [],
      };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const rawMessage =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : this.extractHttpMessage(exceptionResponse);

      return {
        statusCode,
        code:
          statusCode === 404 ? 'ROUTE_NOT_FOUND' : this.httpCode(statusCode),
        message: rawMessage,
        errors: [],
      };
    }

    return {
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Terjadi kesalahan internal pada server.',
      errors: [],
    };
  }

  private extractHttpMessage(response: object): string {
    const value = response as { message?: string | string[] };
    if (Array.isArray(value.message)) {
      return 'Data yang dikirim tidak valid.';
    }
    return value.message ?? 'Request tidak dapat diproses.';
  }

  private httpCode(statusCode: number): string {
    const codes: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'RESOURCE_NOT_FOUND',
      409: 'RESOURCE_ALREADY_EXISTS',
      413: 'PAYLOAD_TOO_LARGE',
      415: 'UNSUPPORTED_MEDIA_TYPE',
      429: 'RATE_LIMITED',
      503: 'SERVICE_UNAVAILABLE',
    };
    return codes[statusCode] ?? 'INTERNAL_SERVER_ERROR';
  }
}
