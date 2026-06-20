import { ApiErrorDetail } from '../interfaces/api-error.interface';

export class AppException extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly errors: ApiErrorDetail[] = [],
  ) {
    super(message);
    this.name = AppException.name;
  }
}
