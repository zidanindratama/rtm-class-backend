import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { ApiResponse } from '../types/api-response.type';

type PartialApiResponse<T> = Pick<ApiResponse<T>, 'message' | 'data'> &
  Partial<Pick<ApiResponse<T>, 'meta' | 'error'>>;

function isResponseEnvelope<T>(value: unknown): value is PartialApiResponse<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    'data' in value
  );
}

@Injectable()
export class ApiResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((value) => {
        if (isResponseEnvelope<T>(value)) {
          return {
            message: value.message,
            data: value.data,
            meta: value.meta ?? null,
            error: value.error ?? null,
          };
        }

        return {
          message: 'Request successful',
          data: value,
          meta: null,
          error: null,
        };
      }),
    );
  }
}
