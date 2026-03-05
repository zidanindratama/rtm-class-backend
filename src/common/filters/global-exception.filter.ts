import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiResponse } from '../types/api-response.type';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const exposeStack = process.env.DEBUG_ERRORS === 'true';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Unexpected server error';
    let errorCode = 'INTERNAL_SERVER_ERROR';
    let details: unknown;

    if (exception instanceof ZodError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Validation failed';
      errorCode = 'VALIDATION_ERROR';
      details = exception.flatten();
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      errorCode = this.mapHttpStatusToCode(status);

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        if (status < HttpStatus.INTERNAL_SERVER_ERROR) {
          details = exceptionResponse;
        }
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const payload = exceptionResponse as {
          statusCode?: number;
          message?: string | string[];
          error?: unknown;
          details?: unknown;
        };
        if (Array.isArray(payload.message)) {
          message = payload.message.join(', ');
        } else if (payload.message) {
          message = payload.message;
        } else if (
          exception.message &&
          exception.message !== 'Bad Request Exception' &&
          exception.message !== 'Http Exception' &&
          exception.message !== 'Unprocessable Entity Exception'
        ) {
          message = exception.message;
        }
        if (status < HttpStatus.INTERNAL_SERVER_ERROR) {
          const fallbackDetails = payload.error ?? payload.details ?? payload;
          if (
            typeof fallbackDetails === 'string' &&
            [
              'Bad Request',
              'Unauthorized',
              'Forbidden',
              'Not Found',
              'Conflict',
            ].includes(fallbackDetails)
          ) {
            details = payload.details;
          } else {
            details = fallbackDetails;
          }
        }
      }

      if (!message || message === 'Unexpected server error') {
        message = this.defaultMessageByStatus(status);
      }
    } else if (exception instanceof PrismaClientKnownRequestError) {
      const prismaMapped = this.mapPrismaKnownError(exception);
      status = prismaMapped.status;
      message = prismaMapped.message;
      errorCode = prismaMapped.code;
    } else if (exception instanceof Error) {
      message = 'Unexpected server error';
    }

    const errorPayload: ApiResponse<null> = {
      message,
      data: null,
      meta: null,
      error: {
        code: errorCode,
        details,
      },
    };

    if (exposeStack && exception instanceof Error) {
      errorPayload.error = {
        ...errorPayload.error,
        stack: exception.stack,
      };
    }

    this.logger.error(
      `[${request.method}] ${request.url} -> ${status} ${message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json(errorPayload);
  }

  private mapPrismaKnownError(error: PrismaClientKnownRequestError): {
    status: HttpStatus;
    message: string;
    code: string;
  } {
    if (error.code === 'P2002') {
      return {
        status: HttpStatus.CONFLICT,
        message: 'Data already exists',
        code: 'DUPLICATE_DATA',
      };
    }

    if (error.code === 'P2025') {
      return {
        status: HttpStatus.NOT_FOUND,
        message: 'Requested data was not found',
        code: 'DATA_NOT_FOUND',
      };
    }

    if (error.code === 'P2021') {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Database is not initialized',
        code: 'DB_NOT_INITIALIZED',
      };
    }

    return {
      status: HttpStatus.BAD_REQUEST,
      message: 'Database request failed',
      code: 'DB_REQUEST_FAILED',
    };
  }

  private mapHttpStatusToCode(status: number): string {
    const statusCodeMap: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
      [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
      [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
      [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
      [HttpStatus.CONFLICT]: 'CONFLICT',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_ERROR',
      [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
    };

    return statusCodeMap[status] ?? HttpStatus[status] ?? 'HTTP_ERROR';
  }

  private defaultMessageByStatus(status: number): string {
    const messageMap: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'Bad request',
      [HttpStatus.UNAUTHORIZED]: 'Unauthorized access',
      [HttpStatus.FORBIDDEN]: 'Forbidden',
      [HttpStatus.NOT_FOUND]: 'Resource not found',
      [HttpStatus.CONFLICT]: 'Conflict',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'Validation failed',
      [HttpStatus.TOO_MANY_REQUESTS]: 'Too many requests',
    };

    return messageMap[status] ?? 'Unexpected server error';
  }
}
