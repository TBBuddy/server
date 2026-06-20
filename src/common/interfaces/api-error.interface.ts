export interface ApiErrorDetail {
  field?: string;
  code: string;
  message: string;
}

export interface ApiErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  errors: ApiErrorDetail[];
  path: string;
  method: string;
  timestamp: string;
  requestId: string;
}
