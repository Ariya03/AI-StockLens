import { METRIC_DEFINITIONS } from '../metrics/catalog.ts';
import type { MetricId, Operator } from '../screening/types.ts';

export type IntentOutcome = 'READY' | 'CLARIFY' | 'UNSUPPORTED';
export type CandidateCondition = { metric: MetricId; operator: Operator; value: number; evidence: string };
export type IntentIssue = { kind: 'AMBIGUOUS' | 'UNSUPPORTED' | 'CONFLICT' | 'ADVERSARIAL'; evidence: string; question: string };
export type ParsedIntent = { outcome: IntentOutcome; conditions: CandidateCondition[]; issues: IntentIssue[] };
export const INTENT_SCHEMA = {
  type:'object',additionalProperties:false,required:['outcome','conditions','issues'],
  properties:{
    outcome:{type:'string',enum:['READY','CLARIFY','UNSUPPORTED']},
    conditions:{type:'array',maxItems:20,items:{type:'object',additionalProperties:false,
      required:['metric','operator','value','evidence'],properties:{
        metric:{type:'string',enum:METRIC_DEFINITIONS.map(m=>m.id)},
        operator:{type:'string',enum:['gt','gte','lt','lte','eq']},
        value:{type:'number'},evidence:{type:'string',minLength:1,maxLength:2000},
      }}},
    issues:{type:'array',maxItems:10,items:{type:'object',additionalProperties:false,
      required:['kind','evidence','question'],properties:{
        kind:{type:'string',enum:['AMBIGUOUS','UNSUPPORTED','CONFLICT','ADVERSARIAL']},
        evidence:{type:'string',minLength:1,maxLength:2000},question:{type:'string',minLength:1,maxLength:200},
      }}},
  },
} as const;
