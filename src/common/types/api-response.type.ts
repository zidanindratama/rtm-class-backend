export interface ApiErrorPayload {
  code: string;
  details?: unknown;
  stack?: string;
}

export interface ApiMetaPayload {
  current_page: number;
  total_pages: number;
  total_items: number;
}

export interface ApiResponse<T> {
  message: string;
  data: T | null;
  meta: ApiMetaPayload | null;
  error: ApiErrorPayload | null;
}
