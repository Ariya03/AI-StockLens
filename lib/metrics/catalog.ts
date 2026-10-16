import type { MetricId, Operator, Unit } from '../screening/types.ts';

export type MetricDefinition = Readonly<{
  id: MetricId; label: string; shortLabel: string; description: string; caveat: string;
  unit: Unit; unitLabel: string; operators: readonly Operator[];
  period?: '2025-4'; window?: 60; scopeLabel: string;
  constraints: Readonly<{ finite: true; min?: number; step: number }>;
}>;
const operators: readonly Operator[] = Object.freeze(['gt','gte','lt','lte','eq']);
export const METRIC_DEFINITIONS: readonly MetricDefinition[] = Object.freeze([
  Object.freeze({ id: 'pe_ttm', label: '市盈率（TTM）', shortLabel: '市盈率',
    description: '供应商提供的滚动十二个月市盈率，衡量价格相对于盈利的倍数。',
    caveat: '零或负市盈率不能直接解释为便宜；建议保留大于零的条件。',
    unit: 'times', unitLabel: '倍', operators, scopeLabel: '最新估值快照', constraints: Object.freeze({ finite: true, step: 1 }) }),
  Object.freeze({ id: 'roe_annual', label: '净资产收益率（2025 年报）', shortLabel: '年报净资产收益率',
    description: '使用 2025 年报的净资产收益率，按供应商返回的百分数原值比较。',
    caveat: '体现该报告期的盈利能力，不能据此判断经营改善；披露日期尚未核实。',
    unit: 'percent', unitLabel: '%', operators, period: '2025-4', scopeLabel: '2025 年报', constraints: Object.freeze({ finite: true, step: 0.5 }) }),
  Object.freeze({ id: 'daily_volatility_60d', label: '近 60 个交易日日收益率波动率', shortLabel: '60 日波动率',
    description: '最近 61 个前复权收盘价计算 60 个简单日收益率，取样本标准差并乘以 100。',
    caveat: '不做年化；分母为 59。数据不足、重复或价格无效时无法判断。历史波动不代表未来走势。',
    unit: 'percent', unitLabel: '%', operators, window: 60, scopeLabel: '60 个交易日 · 前复权 · 不年化', constraints: Object.freeze({ finite: true, min: 0, step: 0.1 }) }),
]);
export function metricDefinition(id: MetricId): MetricDefinition {
  const definition = METRIC_DEFINITIONS.find(m => m.id === id);
  if (!definition) throw new Error('未支持的指标');
  return definition;
}
export const OPERATOR_LABELS: Record<Operator,string> = { gt: '大于', gte: '大于等于', lt: '小于', lte: '小于等于', eq: '等于' };
export const OPERATOR_SYMBOLS: Record<Operator,string> = { gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=' };
