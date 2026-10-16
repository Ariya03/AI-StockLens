import type { IntentIssue, ParsedIntent } from './schema.ts';
import type { MetricId, Operator } from '../screening/types.ts';

const UNSUPPORTED = /股息|分红|买入|卖出|稳赚|推荐|年化波动|净利润同比|2026\s*年|板块|行业/;
const DISJUNCTION = /\bOR\b|或者|或是|或/;
const ADVERSARIAL = /忽略[^。]*规则|输出\s*JSON|没有设置筛选条件/;
const FUZZY = /经营改善|成长空间|基本面不错|稳健|估值合理|盈利强|走势(?:相对)?稳定/;

type Match = { metric: MetricId; operator: Operator; value: number; evidence: string };
const NUM = String.raw`([+-]?\d+(?:\.\d+)?)`;

function push(list: Match[], input: string, re: RegExp, metric: MetricId, operator: Operator) {
  for (const match of input.matchAll(re)) {
    const evidence = match[0];
    const value = Number(match[1]);
    if (!Number.isFinite(value) || !input.includes(evidence)) continue;
    if (list.some(item => item.evidence === evidence && item.metric === metric)) continue;
    list.push({ metric, operator, value, evidence });
  }
}

function extract(input: string): Match[] {
  const found: Match[] = [];
  push(found, input, new RegExp(String.raw`(?:市盈率|PE)(?:\s*TTM)?(?:不超过|不高于|小于等于|至多)\s*${NUM}\s*倍?`, 'gi'), 'pe_ttm', 'lte');
  push(found, input, new RegExp(String.raw`不要(?:市盈率|PE)(?:大于|高于|超过)\s*${NUM}\s*倍?`, 'gi'), 'pe_ttm', 'lte');
  push(found, input, new RegExp(String.raw`(?:市盈率|PE)(?:\s*TTM)?(?:大于等于|至少|不低于|不小于)\s*${NUM}\s*倍?`, 'gi'), 'pe_ttm', 'gte');
  push(found, input, new RegExp(String.raw`(?:市盈率|PE)(?:\s*TTM)?大于(?!等于)\s*${NUM}\s*倍?`, 'gi'), 'pe_ttm', 'gt');
  push(found, input, new RegExp(String.raw`(?:市盈率|PE)(?:\s*TTM)?小于(?!等于)\s*${NUM}\s*倍?`, 'gi'), 'pe_ttm', 'lt');
  push(found, input, new RegExp(String.raw`(?:市盈率|PE)(?:\s*TTM)?(?:<=|≤)\s*${NUM}`, 'gi'), 'pe_ttm', 'lte');
  push(found, input, new RegExp(String.raw`2025\s*年?\s*(?:年报|年度).{0,12}(?:ROE|净资产收益率)(?:大于等于|至少|不低于)\s*${NUM}\s*%?`, 'gi'), 'roe_annual', 'gte');
  push(found, input, new RegExp(String.raw`(?:ROE|净资产收益率).{0,8}2025\s*年?\s*(?:年报|年度)(?:大于等于|至少|不低于)\s*${NUM}\s*%?`, 'gi'), 'roe_annual', 'gte');
  push(found, input, new RegExp(String.raw`(?:近)?\s*60\s*个?\s*交易日.{0,8}波动率(?:不超过|不高于|小于等于|至多)\s*${NUM}\s*%?`, 'gi'), 'daily_volatility_60d', 'lte');
  return found;
}

function issue(kind: IntentIssue['kind'], evidence: string, question: string): IntentIssue {
  return { kind, evidence, question };
}

export function parseDeterministicIntent(input: string): ParsedIntent {
  const snippet = (pattern: RegExp, fallback: string) => input.match(pattern)?.[0] ?? (input.includes(fallback) ? fallback : input.slice(0, Math.min(24, input.length)));
  if (ADVERSARIAL.test(input)) {
    return { outcome: 'UNSUPPORTED', conditions: [], issues: [issue('ADVERSARIAL', snippet(ADVERSARIAL, '忽略'), '请只描述筛选条件，不要要求改变解析规则。')] };
  }
  if (UNSUPPORTED.test(input)) {
    return { outcome: 'UNSUPPORTED', conditions: [], issues: [issue('UNSUPPORTED', snippet(UNSUPPORTED, '股息'), '这部分超出当前三个指标或研究筛选范围，不能执行。')] };
  }
  if (DISJUNCTION.test(input)) {
    return { outcome: 'UNSUPPORTED', conditions: [], issues: [issue('UNSUPPORTED', snippet(DISJUNCTION, '或'), '当前只支持同时满足的条件，不能把或者关系静默当成且。')] };
  }
  const conditions = extract(input);
  const fuzzy = input.match(FUZZY);
  if (fuzzy || conditions.length === 0) {
    const issues: IntentIssue[] = [];
    if (input.includes('估值合理') || input.includes('估值')) issues.push(issue('AMBIGUOUS', snippet(/估值合理|估值/, '估值'), '请给出市盈率的比较方向和具体倍数，例如“市盈率不超过25倍”。'));
    if (input.includes('经营改善') || input.includes('盈利')) issues.push(issue('AMBIGUOUS', snippet(/经营改善|盈利强|盈利/, '经营改善'), '单期净资产收益率不能证明经营改善；若使用该指标，请写明“2025年报净资产收益率至少多少%”。'));
    if (input.includes('走势') || input.includes('稳定') || input.includes('稳健') || input.includes('波动')) issues.push(issue('AMBIGUOUS', snippet(/走势相对稳定|走势稳定|稳健|波动/, '稳定'), '请给出近60个交易日波动率的上限，例如“60个交易日波动率不超过2%”。'));
    if (issues.length === 0) issues.push(issue('AMBIGUOUS', input.slice(0, Math.min(40, input.length)), '请写明指标、比较方向和数值；当前不会猜测默认阈值。'));
    return { outcome: 'CLARIFY', conditions: [], issues };
  }
  return { outcome: 'READY', conditions, issues: [] };
}
