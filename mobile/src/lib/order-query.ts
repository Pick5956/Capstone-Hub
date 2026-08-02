export type OrderListQuery = {
  status?: string;
  payment_status?: string;
  search?: string;
  include_summary?: boolean;
  table_id?: number;
  date?: string;
  page?: number;
  limit?: number;
};

export function buildOrderListPath(params: OrderListQuery = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.payment_status) query.set('payment_status', params.payment_status);
  if (params.search?.trim()) query.set('search', params.search.trim());
  if (params.include_summary) query.set('include_summary', 'true');
  if (params.table_id) query.set('table_id', String(params.table_id));
  if (params.date) query.set('date', params.date);
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  const suffix = query.toString();
  return `/api/v1/orders${suffix ? `?${suffix}` : ''}`;
}

export function formatBangkokDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}
