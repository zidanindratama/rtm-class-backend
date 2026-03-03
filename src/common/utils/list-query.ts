import { ApiMetaPayload } from '../types/api-response.type';

export function buildListMeta(
  totalItems: number,
  page: number,
  perPage: number,
): ApiMetaPayload {
  return {
    current_page: page,
    total_pages: Math.max(1, Math.ceil(totalItems / perPage)),
    total_items: totalItems,
  };
}

export function clampSortOrder(order: 'asc' | 'desc'): 'asc' | 'desc' {
  return order === 'asc' ? 'asc' : 'desc';
}
