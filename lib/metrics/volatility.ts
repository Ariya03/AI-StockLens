import type { DataIssue } from '../screening/types.ts';

type Bar = { date_ms?: unknown; close_price?: unknown };
type Result = { value: number | null; issue: DataIssue | null; validCount: number; windowStart?: string; windowEnd?: string; closes?: readonly number[]; dates?: readonly string[] };
const invalid = (code: string, reason: string, count = 0): Result => ({ value: null, issue: { code, reason }, validCount: count });
export function volatility60(bars: unknown, asOf: string): Result {
  if (!Array.isArray(bars)) return invalid('MALFORMED_HISTORY', '历史行情不是数组');
  const cutoff = Date.parse(`${asOf}T23:59:59.999+08:00`);
  if (!Number.isFinite(cutoff)) return invalid('INVALID_DATE', '行情截止日无效');
  const parsed: { date: number; close: number }[] = [];
  const seen = new Set<number>();
  for (const raw of bars) {
    if (!raw || typeof raw !== 'object') return invalid('INVALID_BAR', '历史行情记录无效');
    const bar = raw as Bar;
    if (typeof bar.date_ms !== 'number' || !Number.isInteger(bar.date_ms) || bar.date_ms <= 0 || !Number.isFinite(new Date(bar.date_ms).getTime())) return invalid('INVALID_DATE', '历史行情日期缺失或无效');
    if (bar.date_ms > cutoff) return invalid('FUTURE_BAR', '历史行情包含截止日之后的数据');
    // Reject duplicate Shanghai trading dates, even if timestamps differ within a day.
    const day = Math.floor((bar.date_ms + 8 * 3600_000) / 86400_000);
    if (seen.has(day)) return invalid('DUPLICATE_DATE', '历史行情包含重复交易日期');
    seen.add(day);
    if (typeof bar.close_price !== 'number' || !Number.isFinite(bar.close_price) || bar.close_price <= 0) return invalid('INVALID_CLOSE', '收盘价缺失、非有限数值或非正数；不能跳过后拼接收益率');
    parsed.push({ date: bar.date_ms, close: bar.close_price });
  }
  if (parsed.length < 61) return invalid('INSUFFICIENT_HISTORY', `需至少 61 个有效收盘价，实际 ${parsed.length}`, parsed.length);
  parsed.sort((a,b) => a.date - b.date);
  const window = parsed.slice(-61), closes = window.map(b => b.close);
  const returns = closes.slice(1).map((close,i) => close / closes[i] - 1);
  if (returns.some(r => !Number.isFinite(r))) return invalid('INVALID_RETURN', '收益率计算溢出');
  const mean = returns.reduce((sum,r) => sum+r,0) / 60;
  const variance = returns.reduce((sum,r) => sum + (r-mean)**2,0) / 59;
  const value = Math.sqrt(variance) * 100;
  if (!Number.isFinite(value)) return invalid('INVALID_RETURN', '波动率计算溢出');
  const day = (ms: number) => new Date(ms + 8*3600_000).toISOString().slice(0,10);
  return { value, issue: null, validCount: parsed.length, windowStart: day(window[0].date), windowEnd: day(window[60].date), closes: Object.freeze(closes), dates: Object.freeze(window.map(b => day(b.date))) };
}
