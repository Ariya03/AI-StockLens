// Synthetic unit-test inputs only. Never imported by the live adapter or application.
import type { ApiResult } from '../lib/fuyao/client.ts';
import type { MetricData, Rule, Snapshot } from '../lib/screening/types.ts';
export const NOW = new Date('2026-10-15T12:00:00+08:00');
export const AS_OF = '2026-10-15';
export const timestamp = Date.parse('2026-10-15T00:00:00+08:00');
export function api(data: unknown, issue: ApiResult['issue'] = null): ApiResult {
  return { data, issue, retrievedAt: NOW.toISOString(), requestId: 'test-request', httpStatus: 200, businessCode: issue ? 5003 : 0 };
}
export function rule(overrides: Partial<Rule> = {}): Rule {
  return { id: 'pe-max', metric: 'pe_ttm', operator: 'lte', value: 25, unit: 'times', origin: 'user', ...overrides };
}
export function metric(value: number | null, overrides: Partial<MetricData> = {}): MetricData {
  return { value, rawValue: value, issue: null, provenance: {
    provider: '扶摇', endpoint: '/test', sourceField: 'unit-test-field', unit: 'times',
    retrievedAt: NOW.toISOString(), providerTimestamp: NOW.toISOString(), timestampStatus: 'known',
    requestId: 'test-request', definition: 'synthetic unit-test input',
  }, ...overrides };
}
export function snapshot(value = 30): Snapshot {
  return { id: 'test-snapshot', createdAt: NOW.toISOString(), asOf: AS_OF,
    universe: { name: 'unit-test', limited: true, size: 1 },
    stocks: [{ code: '600519.SH', name: 'unit-test', metrics: {
      pe_ttm: metric(value), roe_annual: metric(null), daily_volatility_60d: metric(null),
    } }] };
}
export function bars(closes: readonly number[] = Array(61).fill(100)) {
  return closes.map((close,i) => ({ date_ms: timestamp-(closes.length-1-i)*86400_000, close_price: close }));
}
