import type { MetricId, Operator, Rule, Unit } from './types.ts';
import { METRIC_DEFINITIONS, metricDefinition } from '../metrics/catalog.ts';

export type ValidationIssue = { ruleId?: string; code: string; reason: string };
export class RuleValidationError extends Error {
  readonly issues: readonly ValidationIssue[];
  constructor(issues: readonly ValidationIssue[]) {
    super('筛选条件无效'); this.name = 'RuleValidationError'; this.issues = issues;
  }
}
const units = Object.fromEntries(METRIC_DEFINITIONS.map(m => [m.id,m.unit])) as Record<MetricId,Unit>;
const allowed = new Set(['id', 'metric', 'operator', 'value', 'unit', 'origin', 'period', 'window']);

export function validateRules(input: unknown): readonly Rule[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 20) {
    throw new RuleValidationError([{ code: 'RULE_COUNT', reason: '请提供 1–20 项 AND 条件' }]);
  }
  const issues: ValidationIssue[] = []; const rules: Rule[] = []; const ids = new Set<string>();
  for (const candidate of input) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      issues.push({ code: 'SCHEMA', reason: '条件必须为对象' }); continue;
    }
    const r = candidate as Record<string, unknown>;
    const ruleId = typeof r.id === 'string' ? r.id : undefined;
    const add = (code: string, reason: string) => issues.push({ ruleId, code, reason });
    const before = issues.length;
    if (!ruleId || ruleId.trim() !== ruleId || ruleId.length > 80) add('ID', '条件 ID 必须为 1–80 字符且无首尾空格');
    else if (ids.has(ruleId)) add('DUPLICATE_ID', '条件 ID 不能重复');
    else ids.add(ruleId);
    if (Object.keys(r).some(k => !allowed.has(k))) add('SCHEMA', '条件含未支持参数');
    if (typeof r.metric !== 'string' || !Object.hasOwn(units, r.metric)) add('UNSUPPORTED_METRIC', '仅支持 PE TTM、2025 年报 ROE 和 60 日波动率');
    else if (r.unit !== units[r.metric as MetricId]) add('UNIT', `${r.metric} 的单位必须为 ${units[r.metric as MetricId]}`);
    const definition = METRIC_DEFINITIONS.find(m => m.id === r.metric);
    if (!definition?.operators.includes(r.operator as Operator)) add('OPERATOR', '不支持此运算符');
    if (typeof r.value !== 'number' || !Number.isFinite(r.value)) add('VALUE', '阈值必须为有限数值');
    if (r.origin !== 'user' && r.origin !== 'suggested') add('ORIGIN', '须标明用户条件或建议默认值');
    if (definition?.period) {
      if (r.period !== definition.period) add('PERIOD', `报告期仅支持 ${definition.scopeLabel}`);
    } else if (r.period !== undefined) add('PERIOD', '此指标不接受报告期');
    if (definition?.window) {
      if (r.window !== definition.window) add('WINDOW', `仅支持 ${definition.window} 个交易日日收益率窗口`);
    } else if (r.window !== undefined) add('WINDOW', '此指标不接受行情窗口');
    if (definition?.constraints.min !== undefined && typeof r.value === 'number' && r.value < definition.constraints.min) add('VALUE', '波动率阈值不能为负');
    if (issues.length === before) rules.push(Object.freeze({ ...r }) as Rule);
  }
  if (issues.length) throw new RuleValidationError(issues);
  for (const metric of Object.keys(units) as MetricId[]) {
    const matching = rules.filter(r => r.metric === metric);
    let low = metricDefinition(metric).constraints.min ?? -Infinity, high = Infinity;
    let lowClosed = true, highClosed = true;
    for (const r of matching) {
      if (['gt', 'gte', 'eq'].includes(r.operator)) {
        const closed = r.operator !== 'gt';
        if (r.value > low) { low = r.value; lowClosed = closed; }
        else if (r.value === low) lowClosed = lowClosed && closed;
      }
      if (['lt', 'lte', 'eq'].includes(r.operator)) {
        const closed = r.operator !== 'lt';
        if (r.value < high) { high = r.value; highClosed = closed; }
        else if (r.value === high) highClosed = highClosed && closed;
      }
    }
    if (low > high || (low === high && (!lowClosed || !highClosed))) {
      issues.push({ code: 'CONTRADICTION', reason: `${metric} 的条件冲突：${matching.map(r => `${r.id}: ${r.operator} ${r.value}`).join(' AND ')}` });
    }
  }
  if (issues.length) throw new RuleValidationError(issues);
  return Object.freeze(rules);
}
