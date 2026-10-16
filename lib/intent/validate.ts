import { metricDefinition, METRIC_DEFINITIONS } from '../metrics/catalog.ts';
import { validateRules } from '../screening/validation.ts';
import type { Rule } from '../screening/types.ts';
import type { ParsedIntent, CandidateCondition, IntentIssue } from './schema.ts';
import type { PromptVersion } from './prompt.ts';
export type IntentValidation = { accepted:boolean; errors:string[]; parsed:ParsedIntent|null; executableRules:readonly Rule[];
  spans:{evidence:string;start:number;end:number}[] };
const object=(v:unknown):v is Record<string,unknown>=>!!v && typeof v==='object' && !Array.isArray(v);
function exactKeys(v:Record<string,unknown>,keys:string[]) {return Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));}
const ops=['gt','gte','lt','lte','eq'];
export function validateIntent(input:string,raw:unknown,version:PromptVersion='v2'):IntentValidation {
  const errors:string[]=[];const spans:{evidence:string;start:number;end:number}[]=[];
  const reject=():IntentValidation=>({accepted:false,errors,parsed:null,executableRules:[],spans:[]});
  if(!object(raw)||!exactKeys(raw,['outcome','conditions','issues'])||!['READY','CLARIFY','UNSUPPORTED'].includes(String(raw.outcome))||!Array.isArray(raw.conditions)||!Array.isArray(raw.issues)||raw.conditions.length>20||raw.issues.length>10) {errors.push('OUTPUT_SCHEMA');return reject();}
  const numericToken=(quote:string,value:number)=>[...quote.matchAll(/(?<![\d.])[+-]?\d+(?:\.\d+)?(?![\d.])/g)].some(m=>Number(m[0])===value);
  for(const c of raw.conditions) {
    if(!object(c)||!exactKeys(c,['metric','operator','value','evidence'])||!METRIC_DEFINITIONS.some(m=>m.id===c.metric)||!ops.includes(String(c.operator))||typeof c.value!=='number'||!Number.isFinite(c.value)||typeof c.evidence!=='string'||!c.evidence||c.evidence.length>2000) {errors.push('CONDITION_SCHEMA');continue;}
    const start=input.indexOf(c.evidence);
    if(start<0) errors.push('EVIDENCE_NOT_IN_INPUT'); else spans.push({evidence:c.evidence,start,end:start+c.evidence.length});
    if(!numericToken(c.evidence,c.value)) errors.push('VALUE_NOT_IN_EVIDENCE');
    if(version==='v2') errors.push(...verifyLiteralEvidence(c as CandidateCondition));
  }
  for(const i of raw.issues) {
    if(!object(i)||!exactKeys(i,['kind','evidence','question'])||!['AMBIGUOUS','UNSUPPORTED','CONFLICT','ADVERSARIAL'].includes(String(i.kind))||typeof i.evidence!=='string'||!i.evidence||i.evidence.length>2000||!input.includes(i.evidence)||typeof i.question!=='string'||!i.question||i.question.length>200||!/[\u3400-\u9fff]/.test(i.question)) errors.push('ISSUE_SCHEMA_OR_EVIDENCE');
  }
  if(errors.length) return reject();
  const parsed=raw as unknown as ParsedIntent;
  if(version==='v2'&&parsed.outcome==='READY'&&/(?:股息|净利润同比|2026年|年化波动|或者|稳赚|推荐|买入|经营改善|成长空间|基本面不错|稳健|估值合理|盈利强|走势稳定|忽略[^。]*规则|没有设置筛选条件)/.test(input)) errors.push('UNRESOLVED_FULL_INPUT');
  if(parsed.outcome==='READY'&&(parsed.conditions.length===0||parsed.issues.length>0)) errors.push('READY_INCOMPLETE');
  if(parsed.outcome!=='READY'&&parsed.issues.length===0) errors.push('MISSING_CLARIFICATION');
  const rules:Rule[]=parsed.conditions.map((c,i)=>{
    const d=metricDefinition(c.metric);
    return {id:`intent-${i+1}`,metric:c.metric,operator:c.operator,value:c.value,unit:d.unit,origin:'user',...(d.period?{period:d.period}:{}),...(d.window?{window:d.window}:{})};
  });
  try {for(const r of rules) validateRules([r]);} catch {errors.push('INVALID_CONDITION');}
  if(parsed.outcome==='READY') {try {validateRules(rules);} catch {errors.push('INVALID_OR_CONTRADICTORY_RULES');}}
  if(errors.length) return reject();
  return {accepted:true,errors:[],parsed,executableRules:parsed.outcome==='READY'?validateRules(rules):[],spans};
}
// V2 is a rejection gate on model-proposed evidence, never an alternate parser:
// it cannot create, correct, substitute, or add any executable condition.
function verifyLiteralEvidence(c:CandidateCondition):string[] {
  const e=c.evidence,errors:string[]=[];
  const aliases={pe_ttm:/(?:PE|市盈率)/i,roe_annual:/(?:ROE|净资产收益率)/i,daily_volatility_60d:/波动率/};
  if(!aliases[c.metric].test(e)) errors.push('METRIC_NOT_IN_EVIDENCE');
  if(c.metric==='roe_annual'&&!/2025\s*年?\s*(?:年报|年度)/.test(e)) errors.push('REPORT_NOT_EXPLICIT');
  if(c.metric==='daily_volatility_60d'&&!/60\s*个?\s*交易日/.test(e)) errors.push('WINDOW_NOT_EXPLICIT');
  if(/(?:年化|2026年|20个交易日|MRQ|新闻|事实|举例|示例|忽略|输出|JSON|稳赚|买入|推荐)/i.test(e)) errors.push('UNSAFE_OR_MISMATCHED_EVIDENCE');
  const expressions:Record<string,RegExp>={
    gt:/(?:大于(?!等于)|高于|超过)\s*([+-]?\d+(?:\.\d+)?)|(?<![<>=])>\s*([+-]?\d+(?:\.\d+)?)/g,
    gte:/(?:大于等于|至少|不低于|不小于)\s*([+-]?\d+(?:\.\d+)?)|(?:>=|≥)\s*([+-]?\d+(?:\.\d+)?)/g,
    lt:/(?:小于(?!等于)|低于|不足)\s*([+-]?\d+(?:\.\d+)?)|(?<![<>=])<\s*([+-]?\d+(?:\.\d+)?)/g,
    lte:/(?:小于等于|不超过|至多|不高于|不要(?:PE|市盈率)?(?:大于|高于|超过))\s*([+-]?\d+(?:\.\d+)?)|(?:<=|≤)\s*([+-]?\d+(?:\.\d+)?)/g,
    eq:/(?:等于)\s*([+-]?\d+(?:\.\d+)?)|(?<![<>=])=\s*([+-]?\d+(?:\.\d+)?)/g,
  };
  const mentioned=Object.values(aliases).filter(re=>re.test(e)).length;
  const localEvidence=mentioned>1?e.split(/[，,。；;]/).filter(clause=>aliases[c.metric].test(clause)).join('；'):e;
  const matches=[...localEvidence.matchAll(expressions[c.operator])];
  const grounded=matches.some(m=>{
    const value=Number(m[1]??m[2]);const prefix=localEvidence.slice(0,m.index);
    const negated=c.operator==='gt'||c.operator==='lt'?/(?:不|不要(?:PE|市盈率)?)$/.test(prefix):c.operator==='eq'?/(?:大于|小于)$/.test(prefix):false;
    return value===c.value&&!negated;
  });
  if(!grounded) errors.push('OPERATOR_OR_VALUE_NOT_GROUNDED');
  return errors;
}
