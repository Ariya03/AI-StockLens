import { DEFAULT_RULES } from '../screening/defaults.ts';
import type { MetricId, Operator, Rule } from '../screening/types.ts';
import { metricDefinition, METRIC_DEFINITIONS, OPERATOR_LABELS } from '../metrics/catalog.ts';
import { validateRules, RuleValidationError } from '../screening/validation.ts';
import type { ValidationIssue } from '../screening/validation.ts';

export type DraftRule = { id: string; metric: MetricId; operator: Operator; value: string; origin: Rule['origin']; enabled: boolean };
export function toDraft(rules: readonly Rule[] = DEFAULT_RULES): DraftRule[] {
  return rules.map(r => ({ id: r.id, metric: r.metric, operator: r.operator, value: String(r.value), origin: r.origin, enabled: true }));
}
export function draftRules(drafts: readonly DraftRule[]): readonly Rule[] {
  const rules = drafts.filter(r => r.enabled).map(r => {
    const d = metricDefinition(r.metric);
    return { id: r.id, metric: r.metric, operator: r.operator,
      value: r.value.trim() === '' ? NaN : Number(r.value), origin: r.origin, unit: d.unit,
      ...(d.period ? { period: d.period } : {}), ...(d.window ? { window: d.window } : {}) };
  });
  return validateRules(rules);
}
export function chineseIssue(issue: ValidationIssue): string {
  let message = issue.reason;
  for (const d of METRIC_DEFINITIONS) message = message.replaceAll(d.id,d.label);
  for (const [op,label] of Object.entries(OPERATOR_LABELS)) message = message.replace(new RegExp(`\\b${op}\\b`,'g'),label);
  return message.replaceAll(' AND ',' 且 ').replaceAll('AND','同时满足').replaceAll('times','倍').replaceAll('percent','百分比');
}
export function draftErrors(drafts: readonly DraftRule[]): string[] {
  try { draftRules(drafts); return []; }
  catch (error) { return error instanceof RuleValidationError ? error.issues.map(issue=>{
    let text=issue.reason;
    drafts.forEach((draft,i)=>{text=text.replaceAll(draft.id,`第 ${i+1} 项条件`);});
    return chineseIssue({...issue,reason:text});
  }) : ['条件配置无效，请检查指标与阈值。']; }
}
export const EXAMPLE_STRATEGIES = [
  { id: 'balanced', title: '估值、盈利与稳定性', intent: '我想找估值适中、2025 年盈利能力较强、最近日常波动较小的股票。',
    description: '市盈率上限 25 倍、年报净资产收益率至少 10%、波动率不超过 2%。', rules: DEFAULT_RULES },
  { id: 'profit', title: '侧重盈利能力', intent: '我更关注 2025 年的盈利能力，可以接受较宽的估值和波动范围。',
    description: '市盈率上限 45 倍、年报净资产收益率至少 10%、波动率不超过 3%。',
    rules: DEFAULT_RULES.map(r => r.id === 'pe-max' ? { ...r,value:45 } : r.id === 'vol-max' ? { ...r,value:3 } : r) },
  { id: 'valuation', title: '只观察估值范围', intent: '先观察市盈率为正且不超过 25 倍的股票，再研究其他指标。',
    description: '仅启用市盈率条件，适合试着把上限从 25 倍改到 45 倍。',
    rules: DEFAULT_RULES.filter(r => r.metric === 'pe_ttm') },
] as const;
export const SAVED_STRATEGY_KEY = 'stocklens.saved-strategy.v1';
export type SavedStrategy = { version: 1; savedAt: string; intent: string; drafts: DraftRule[] };
const OPERATORS = new Set(['gt','gte','lt','lte','eq']);
export function serializeStrategy(intent: string, drafts: readonly DraftRule[]): SavedStrategy {
  return { version: 1, savedAt: new Date().toISOString(), intent, drafts: drafts.map(draft => ({ ...draft })) };
}
export function parseSavedStrategy(raw: unknown): SavedStrategy | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (value.version !== 1 || typeof value.savedAt !== 'string' || typeof value.intent !== 'string' || !Array.isArray(value.drafts) || value.drafts.length > 20) return null;
  const drafts: DraftRule[] = [];
  for (const item of value.drafts) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== 'string' || typeof row.metric !== 'string' || !METRIC_DEFINITIONS.some(d => d.id === row.metric) || typeof row.operator !== 'string' || !OPERATORS.has(row.operator) || typeof row.value !== 'string' || (row.origin !== 'user' && row.origin !== 'suggested') || typeof row.enabled !== 'boolean') return null;
    drafts.push({ id: row.id, metric: row.metric as DraftRule['metric'], operator: row.operator as DraftRule['operator'], value: row.value, origin: row.origin, enabled: row.enabled });
  }
  return { version: 1, savedAt: value.savedAt, intent: value.intent, drafts };
}
export function exampleDrafts(id: string): DraftRule[] {
  const example = EXAMPLE_STRATEGIES.find(e => e.id === id) ?? EXAMPLE_STRATEGIES[0];
  return toDraft().map(draft => {
    const r = example.rules.find(r => r.id === draft.id);
    return r ? { ...draft,value:String(r.value),enabled:true } : { ...draft,enabled:false };
  });
}
