import { metricDefinition, OPERATOR_SYMBOLS, OPERATOR_LABELS } from '../metrics/catalog.ts';
import type { MetricData, Rule, StockResult, StockStatus } from '../screening/types.ts';
export const STOCK_LABELS: Record<StockStatus,string> = { INCLUDED:'已入选', EXCLUDED:'已排除', UNKNOWN:'无法判断' };
export const RULE_LABELS = { PASS:'满足', FAIL:'不满足', UNKNOWN:'无法判断' } as const;
export function formatValue(value: number | null, unitLabel: string): string {
  return value === null || !Number.isFinite(value) ? '暂无数据' : `${value.toLocaleString('zh-CN',{maximumFractionDigits:4})}${unitLabel}`;
}
export function formatTime(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '未提供';
  return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value));
}
export function ruleText(rule: Rule): string {
  const d = metricDefinition(rule.metric);
  return `${d.label} ${OPERATOR_SYMBOLS[rule.operator]} ${rule.value}${d.unitLabel}`;
}
export function issueText(data: MetricData): string {
  if (!data.issue) return '';
  if (data.issue.code === 'MISSING_KEY' || data.issue.code === 'INVALID_KEY') return '金融数据服务尚未正确配置，请联系服务维护者。';
  return data.issue.reason;
}
export function stockExplanation(stock: StockResult): string {
  const fail = stock.rules.filter(r => r.status === 'FAIL');
  const unknown = stock.rules.filter(r => r.status === 'UNKNOWN');
  if (fail.length) return `未满足${fail.map(r => `「${metricDefinition(r.rule.metric).shortLabel}」`).join('、')}条件。${unknown.length ? `另有 ${unknown.length} 项条件无法判断。` : ''}`;
  if (unknown.length) return `${unknown.length} 项条件缺少可用依据，暂不能确认是否入选。`;
  return `全部 ${stock.rules.length} 项启用条件均满足。`;
}
export type Comparison = ReturnType<typeof import('../screening/engine.ts').compareRules>;
export function transitionExplanation(before: StockResult, after: StockResult): string {
  const unchanged = { INCLUDED:'仍然入选。', EXCLUDED:'仍然排除。', UNKNOWN:'仍无法判断。' };
  const conclusion = before.status === after.status ? unchanged[after.status] : `从${STOCK_LABELS[before.status]}变为${STOCK_LABELS[after.status]}。`;
  const changes:string[]=[];
  for(const current of after.rules) {
    const previous=before.rules.find(r=>r.rule.id===current.rule.id);
    const d=metricDefinition(current.rule.metric);
    if(!previous) changes.push(`新增「${d.shortLabel}」条件，当前${RULE_LABELS[current.status]}。`);
    else if(previous.rule.value!==current.rule.value || previous.rule.operator!==current.rule.operator) {
      changes.push(`「${d.shortLabel}」实际值${formatValue(current.actualValue,d.unitLabel)}；条件从${OPERATOR_LABELS[previous.rule.operator]} ${previous.rule.value}${d.unitLabel}改为${OPERATOR_LABELS[current.rule.operator]} ${current.rule.value}${d.unitLabel}，${RULE_LABELS[previous.status]} → ${RULE_LABELS[current.status]}。`);
    }
  }
  for(const previous of before.rules) if(!after.rules.some(r=>r.rule.id===previous.rule.id)) changes.push(`停用「${metricDefinition(previous.rule.metric).shortLabel}」条件，不再参与判断。`);
  return conclusion + changes.join('') + stockExplanation(after);
}
