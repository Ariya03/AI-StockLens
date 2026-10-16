import type { Rule } from './types.ts';
export const DEFAULT_RULES: readonly Rule[] = Object.freeze([
  Object.freeze({ id: 'pe-positive', metric: 'pe_ttm', operator: 'gt', value: 0, unit: 'times', origin: 'suggested' }),
  Object.freeze({ id: 'pe-max', metric: 'pe_ttm', operator: 'lte', value: 25, unit: 'times', origin: 'suggested' }),
  Object.freeze({ id: 'roe-min', metric: 'roe_annual', operator: 'gte', value: 10, unit: 'percent', period: '2025-4', origin: 'suggested' }),
  Object.freeze({ id: 'vol-max', metric: 'daily_volatility_60d', operator: 'lte', value: 2, unit: 'percent', window: 60, origin: 'suggested' }),
]);
