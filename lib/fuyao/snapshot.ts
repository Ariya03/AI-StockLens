import 'server-only';
import { randomUUID } from 'node:crypto';
import { createFuyaoClient } from './client.ts';
import type { FuyaoClient } from './client.ts';
import { normalizePe, normalizeRoe, normalizeVolatility } from '../metrics/normalize.ts';
import type { Snapshot, StockData } from '../screening/types.ts';

export const UNIVERSE = Object.freeze([
  Object.freeze({ code: '600519.SH', name: '贵州茅台' }),
  Object.freeze({ code: '000001.SZ', name: '平安银行' }),
  Object.freeze({ code: '300033.SZ', name: '同花顺' }),
]);
export function shanghaiToday(now = new Date()): string {
  return new Date(now.getTime()+8*3600_000).toISOString().slice(0,10);
}
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze); Object.freeze(value);
  }
  return value;
}
export async function fetchSnapshot(options: { client?: FuyaoClient; asOf?: string; now?: Date } = {}): Promise<Snapshot> {
  const now = options.now ?? new Date(); const asOf = options.asOf ?? shanghaiToday(now);
  const parsedDate = Date.parse(`${asOf}T00:00:00+08:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !Number.isFinite(parsedDate)) throw new Error('无效截止日期');
  const normalizedDate = new Date(parsedDate+8*3600_000).toISOString().slice(0,10);
  if (normalizedDate !== asOf || asOf !== shanghaiToday(now)) throw new Error('仅支持当前日期快照，不支持历史时点估值');
  const client = options.client ?? createFuyaoClient();
  const end = Date.parse(`${asOf}T23:59:59.999+08:00`);
  const start = Date.parse(`${asOf}T00:00:00+08:00`)-180*86400_000;
  const valuation = await client.valuations(UNIVERSE.map(s => s.code));
  const stocks: StockData[] = [];
  // At most two upstream requests in flight. No aggressive automatic retries.
  for (const stock of UNIVERSE) {
    const [financial, historical] = await Promise.all([client.financials(stock.code),client.historical(stock.code,start,end)]);
    stocks.push({ ...stock, metrics: {
      pe_ttm: normalizePe(valuation,stock.code,asOf),
      roe_annual: normalizeRoe(financial,stock.code),
      daily_volatility_60d: normalizeVolatility(historical,asOf),
    } });
  }
  return deepFreeze({ id: randomUUID(), createdAt: (options.now ?? new Date()).toISOString(), asOf,
    universe: { name: '三只已验证 A 股开发股票池', limited: true, size: stocks.length }, stocks });
}
