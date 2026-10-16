import type { MetricData, Operator, Rule, RuleResult, ScreeningResult, Snapshot, StockStatus } from './types.ts';
import { validateRules } from './validation.ts';

const compare: Record<Operator, (a: number, b: number) => boolean> = {
  gt: (a,b) => a > b, gte: (a,b) => a >= b, lt: (a,b) => a < b,
  lte: (a,b) => a <= b, eq: (a,b) => a === b,
};
export function evaluateRule(rule: Rule, evidence: MetricData): RuleResult {
  if (evidence.issue || evidence.value === null || !Number.isFinite(evidence.value)) {
    return { rule, status: 'UNKNOWN', actualValue: null,
      reason: evidence.issue?.reason ?? '数据缺失或无效', evidence };
  }
  if (rule.unit !== evidence.provenance.unit ||
      (rule.metric === 'roe_annual' && rule.period !== evidence.provenance.reportPeriod) ||
      (rule.metric === 'daily_volatility_60d' && (rule.window !== evidence.provenance.window || evidence.provenance.adjustment !== 'forward'))) {
    return { rule, status: 'UNKNOWN', actualValue: null, reason: '数据口径与条件不一致', evidence };
  }
  const status = compare[rule.operator](evidence.value, rule.value) ? 'PASS' : 'FAIL';
  return { rule, status, actualValue: evidence.value,
    reason: `${evidence.value} ${evidence.provenance.unit} ${rule.operator} ${rule.value}：${status === 'PASS' ? '满足' : '不满足'}`, evidence };
}
export function aggregate(results: readonly Pick<RuleResult, 'status'>[]): StockStatus {
  if (results.length === 0) throw new Error('不得执行空条件筛选');
  if (results.some(r => r.status === 'FAIL')) return 'EXCLUDED';
  return results.some(r => r.status === 'UNKNOWN') ? 'UNKNOWN' : 'INCLUDED';
}
export function screen(snapshot: Snapshot, input: unknown): ScreeningResult {
  const rules = validateRules(input);
  const counts: Record<StockStatus, number> = { INCLUDED: 0, EXCLUDED: 0, UNKNOWN: 0 };
  const stocks = snapshot.stocks.map(stock => {
    const results = rules.map(rule => evaluateRule(rule, stock.metrics[rule.metric]));
    const status = aggregate(results); counts[status]++;
    return { code: stock.code, name: stock.name, status, rules: results };
  });
  return { snapshotId: snapshot.id, logic: 'AND', rules, stocks, counts };
}
export function compareRules(snapshot: Snapshot, beforeInput: unknown, afterInput: unknown) {
  const before = screen(snapshot, beforeInput), after = screen(snapshot, afterInput);
  const earlier = new Map(before.stocks.map(s => [s.code, s.status]));
  const changes = after.stocks.map(s => ({ code: s.code, before: earlier.get(s.code)!, after: s.status }));
  const byId = new Map(before.rules.map(r => [r.id, r]));
  const signature = (r: Rule | undefined) => r ? JSON.stringify([r.metric,r.operator,r.value,r.unit,r.origin,r.period,r.window]) : null;
  const changedRuleIds = [...new Set([...before.rules, ...after.rules].map(r => r.id))]
    .filter(id => signature(byId.get(id)) !== signature(after.rules.find(r => r.id === id)));
  return {
    snapshotId: snapshot.id, changedRuleIds, before, after,
    newlyIncluded: changes.filter(c => c.before !== 'INCLUDED' && c.after === 'INCLUDED').map(c => c.code),
    noLongerIncluded: changes.filter(c => c.before === 'INCLUDED' && c.after !== 'INCLUDED').map(c => c.code),
    stillIncluded: changes.filter(c => c.before === 'INCLUDED' && c.after === 'INCLUDED').map(c => c.code),
    unknownTransitions: changes.filter(c => c.before !== c.after && (c.before === 'UNKNOWN' || c.after === 'UNKNOWN')),
  };
}
