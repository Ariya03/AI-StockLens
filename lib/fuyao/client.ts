import 'server-only';
import type { DataIssue } from '../screening/types.ts';

export type ApiResult = Readonly<{
  data: unknown; issue: DataIssue | null; retrievedAt: string; requestId: string | null;
  httpStatus: number | null; businessCode: number | null;
}>;
type ClientOptions = { apiKey?: string; fetcher?: typeof fetch; timeoutMs?: number; now?: () => Date };
export const ENDPOINTS = {
  valuations: '/api/a-share/valuations/snapshot',
  financials: '/api/a-share/financials/indicators',
  historical: '/api/a-share/prices/historical',
} as const;
export function createFuyaoClient(options: ClientOptions = {}) {
  const key = options.apiKey ?? process.env.FUYAO_API_KEY;
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const now = options.now ?? (() => new Date());
  async function request(path: string, params: Record<string, string | number>): Promise<ApiResult> {
    const retrievedAt = now().toISOString();
    const base = { retrievedAt, data: null, requestId: null, httpStatus: null, businessCode: null };
    const failure = (code: string, reason: string): ApiResult => ({ ...base, retrievedAt: now().toISOString(), issue: { code, reason } });
    if (!key?.trim()) return failure('MISSING_KEY', '服务端未配置非空 FUYAO_API_KEY');
    if (/[\r\n]/.test(key)) return failure('INVALID_KEY', '服务端密钥格式无效');
    const url = new URL(path, 'https://fuyao.aicubes.cn');
    Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, String(v)));
    try {
      const response = await fetcher(url, {
        headers: { 'X-api-key': key }, cache: 'no-store', redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) return { ...failure('HTTP_ERROR', `金融数据接口 HTTP ${response.status}`), httpStatus: response.status };
      let body: unknown;
      try { body = await response.json(); }
      catch { return { ...failure('INVALID_JSON', '金融数据接口返回非 JSON 响应'), httpStatus: response.status }; }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return { ...failure('MALFORMED_RESPONSE', '金融数据响应格式异常'), httpStatus: response.status };
      const envelope = body as Record<string, unknown>;
      const businessCode = typeof envelope.code === 'number' && Number.isInteger(envelope.code) ? envelope.code : null;
      const requestId = typeof envelope.request_id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(envelope.request_id) && !envelope.request_id.includes(key) ? envelope.request_id : null;
      const metadata = { retrievedAt: now().toISOString(), requestId, httpStatus: response.status, businessCode };
      if (businessCode === null) return { ...metadata, data: null, issue: { code: 'MALFORMED_RESPONSE', reason: '响应缺少有效业务码' } };
      if (businessCode !== 0) return { ...metadata, data: null, issue: { code: 'BUSINESS_ERROR', reason: `金融数据接口业务错误 ${businessCode}` } };
      if (!envelope.data || typeof envelope.data !== 'object' || Array.isArray(envelope.data)) return { ...metadata, data: null, issue: { code: 'MALFORMED_DATA', reason: '成功响应缺少有效数据对象' } };
      return { ...metadata, data: envelope.data, issue: null };
    } catch (error) {
      // Never log/return upstream text, URLs, request headers, or exception messages.
      const name = error instanceof Error ? error.name : '';
      return failure(name === 'TimeoutError' || name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
        name === 'TimeoutError' || name === 'AbortError' ? '金融数据请求超时' : '金融数据网络或 TLS 请求失败');
    }
  }
  return {
    valuations: (codes: readonly string[]) => request(ENDPOINTS.valuations, { thscodes: codes.join(',') }),
    financials: (code: string) => request(ENDPOINTS.financials, { thscode: code, report: '2025-4' }),
    historical: (code: string, start: number, end: number) => request(ENDPOINTS.historical, { thscode: code, interval: '1d', start, end, adjust: 'forward' }),
  };
}
export type FuyaoClient = ReturnType<typeof createFuyaoClient>;
