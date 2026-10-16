import type { ApiResult } from '../fuyao/client.ts';
import { ENDPOINTS } from '../fuyao/client.ts';
import type { DataIssue, MetricData, Provenance } from '../screening/types.ts';
import { volatility60 } from './volatility.ts';

export const FRESHNESS_MAX_AGE_DAYS = 7; // Explicit MVP policy; not proof of trading-calendar completeness.
const obj = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : {};
export function providerTime(raw: unknown): Pick<Provenance,'providerTimestamp' | 'timestampStatus'> {
  if (raw === null || raw === undefined) return { providerTimestamp: null, timestampStatus: 'missing' };
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 0 || !Number.isFinite(new Date(raw).getTime())) return { providerTimestamp: null, timestampStatus: 'invalid' };
  return { providerTimestamp: new Date(raw).toISOString(), timestampStatus: 'known' };
}
function freshness(p: Provenance, asOf: string): DataIssue | null {
  if (!p.providerTimestamp) return { code: 'UNKNOWN_TIMESTAMP', reason: '供应商数据时间缺失或无效，无法判断新鲜度' };
  const time = Date.parse(p.providerTimestamp), cutoff = Date.parse(`${asOf}T23:59:59.999+08:00`);
  if (time > cutoff || time > Date.parse(p.retrievedAt) + 5*60_000) return { code: 'FUTURE_TIMESTAMP', reason: '供应商数据时间晚于截止日或获取时间' };
  if (cutoff-time > FRESHNESS_MAX_AGE_DAYS*86400_000) return { code: 'STALE', reason: '供应商数据时间超过 7 个自然日新鲜度上限' };
  return null;
}
function provenance(result: ApiResult, spec: Omit<Provenance,'provider'|'retrievedAt'|'requestId'|'providerTimestamp'|'timestampStatus'>): Provenance {
  return { ...spec, provider: '扶摇', retrievedAt: result.retrievedAt, requestId: result.requestId,
    ...providerTime(obj(result.data).timestamp) };
}
function unknown(p: Provenance, issue: DataIssue): MetricData { return { value: null, rawValue: null, provenance: p, issue }; }
export function normalizePe(result: ApiResult, code: string, asOf: string): MetricData {
  const p = provenance(result, { endpoint: ENDPOINTS.valuations, sourceField: 'data.item[].pe_ttm', unit: 'times', definition: '供应商 PE TTM，倍；零或负值不自动解释为便宜' });
  if (result.issue) return unknown(p,result.issue);
  const items = obj(result.data).item;
  if (!Array.isArray(items)) return unknown(p,{ code: 'MALFORMED_DATA', reason: '估值列表格式异常' });
  const matched = items.filter(i => obj(i).thscode === code);
  if (matched.length !== 1) return unknown(p,{ code: matched.length ? 'DUPLICATE_STOCK' : 'MISSING_STOCK', reason: matched.length ? '估值响应重复返回股票' : '供应商未返回此股票的估值' });
  const value = obj(matched[0]).pe_ttm;
  if (value === null || value === undefined) return unknown(p,{ code: 'MISSING_VALUE', reason: 'PE TTM 缺失' });
  if (typeof value !== 'number' || !Number.isFinite(value)) return unknown(p,{ code: 'INVALID_VALUE', reason: 'PE TTM 不是有限数值' });
  return { value, rawValue: value, provenance: p, issue: freshness(p,asOf) };
}
export function normalizeRoe(result: ApiResult, code: string): MetricData {
  const p: Provenance = { ...provenance(result, { endpoint: ENDPOINTS.financials, sourceField: 'data.abilities[].indicators[index_id=index_weighted_avg_roe].value', unit: 'percent', reportPeriod: '2025-4', disclosureDate: null, definition: 'index_weighted_avg_roe，2025 年报，供应商百分数原值；不表示经营改善' }), providerTimestamp: null, timestampStatus: 'not-provided' };
  if (result.issue) return unknown(p,result.issue);
  const data = obj(result.data);
  if (data.thscode !== code || data.report !== '2025-4') return unknown(p,{ code: 'IDENTITY_MISMATCH', reason: '财务响应股票或报告期与请求不一致' });
  if (!Array.isArray(data.abilities)) return unknown(p,{ code: 'MALFORMED_DATA', reason: '财务能力列表格式异常' });
  const matched = data.abilities.flatMap(a => Array.isArray(obj(a).indicators) ? obj(a).indicators as unknown[] : []).filter(i => obj(i).index_id === 'index_weighted_avg_roe');
  if (matched.length !== 1) return unknown(p,{ code: matched.length ? 'DUPLICATE_FIELD' : 'MISSING_VALUE', reason: matched.length ? 'ROE 字段重复' : 'ROE 字段缺失' });
  const raw = obj(matched[0]).value;
  if (raw === null || raw === undefined) return unknown(p,{ code: 'MISSING_VALUE', reason: 'ROE 缺失，不能填零' });
  if (typeof raw !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw) || !Number.isFinite(Number(raw))) return unknown(p,{ code: 'INVALID_VALUE', reason: 'ROE 不是有效数字字符串' });
  return { value: Number(raw), rawValue: raw, provenance: p, issue: null };
}
export function normalizeVolatility(result: ApiResult, asOf: string): MetricData {
  const p = provenance(result, { endpoint: ENDPOINTS.historical, sourceField: 'data.item[].close_price / date_ms', unit: 'percent', adjustment: 'forward', window: 60, definition: '60 个日简单收益率的样本标准差 ×100；61 个前复权收盘价；分母 59；不年化' });
  if (result.issue) return unknown(p,result.issue);
  const computed = volatility60(obj(result.data).item, asOf);
  if (computed.issue) return unknown(p,computed.issue);
  const latest = Date.parse(`${computed.windowEnd}T00:00:00+08:00`);
  const cutoff = Date.parse(`${asOf}T23:59:59.999+08:00`);
  const issue = freshness(p,asOf) ?? (cutoff-latest > FRESHNESS_MAX_AGE_DAYS*86400_000 ? { code: 'STALE_HISTORY', reason: '最近收盘价超过 7 个自然日新鲜度上限' } : null);
  return { value: computed.value, rawValue: null, provenance: { ...p, windowStart: computed.windowStart, windowEnd: computed.windowEnd }, issue,
    derivedInputs: { dates: computed.dates!, closes: computed.closes! } };
}
