import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIntent } from '../lib/intent/validate.ts';
import { EVAL_CASES } from '../evaluations/intent/cases.ts';

// Pure guard invariants, not model-quality results. Real quality evaluation uses
// only actual Ollama requests saved in evaluations/intent/v1 and v2.
const ready=(evidence='PE不超过20倍。',value:unknown=20,operator='lte')=>({outcome:'READY',conditions:[{metric:'pe_ttm',operator,value,evidence}],issues:[]});
test('explicit numerical threshold becomes a user rule with registry semantics',()=>{
  const result=validateIntent('PE不超过20倍。',ready());
  assert.equal(result.accepted,true);assert.equal(result.executableRules[0].value,20);
  assert.equal(result.executableRules[0].origin,'user');assert.equal(result.executableRules[0].unit,'times');
  assert.equal(result.executableRules.length,1);
});
test('additional facts/recommendation fields cannot enter executable output',()=>{
  const result=validateIntent('PE不超过20倍。',{...ready(),recommendation:'买入某股票'});
  assert.equal(result.accepted,false);assert.equal(result.executableRules.length,0);
});
test('string or non-finite thresholds are rejected',()=>{
  for(const value of ['20',NaN,Infinity])assert.equal(validateIntent('PE不超过20倍。',ready(undefined,value)).accepted,false);
});
test('altered explicit value is rejected, never corrected automatically',()=>{
  const result=validateIntent('PE不超过20倍。',ready(undefined,25));
  assert.equal(result.accepted,false);assert.equal(result.executableRules.length,0);
});
test('reversed operator and negation errors are rejected',()=>{
  assert.equal(validateIntent('PE不超过20倍。',ready(undefined,20,'gt')).accepted,false);
  assert.equal(validateIntent('不要PE大于20倍的股票。',ready('不要PE大于20倍的股票。',20,'lt')).accepted,false);
});
test('evidence must be copied exactly, not paraphrased',()=>{
  assert.equal(validateIntent('PE不超过20倍。',ready('市盈率不超过20倍。')).accepted,false);
});
test('unsupported or invented metrics are rejected structurally',()=>{
  const raw=ready();raw.conditions[0].metric='dividend_yield';
  assert.equal(validateIntent('股息率不超过20%。',raw).accepted,false);
});
test('report and window require explicit evidence',()=>{
  for(const [metric,evidence] of [['roe_annual','ROE至少10%。'],['daily_volatility_60d','波动率不超过10%。']]) {
    const raw={outcome:'READY',conditions:[{metric,operator:'gte',value:10,evidence}],issues:[]};
    assert.equal(validateIntent(evidence,raw).accepted,false);
  }
});
test('explicit annual ROE uses percent points and registry period',()=>{
  const input='2025年报ROE至少10%。';const raw={outcome:'READY',conditions:[{metric:'roe_annual',operator:'gte',value:10,evidence:input}],issues:[]};
  const result=validateIntent(input,raw);assert.equal(result.accepted,true);
  assert.equal(result.executableRules[0].value,10);assert.equal(result.executableRules[0].period,'2025-4');
});
test('CLARIFY and UNSUPPORTED never produce executable partial rules',()=>{
  for(const outcome of ['CLARIFY','UNSUPPORTED']) {
    const input='PE不超过20倍，股息率至少3%。';
    const raw={...ready('PE不超过20倍'),outcome,issues:[{kind:'UNSUPPORTED',evidence:'股息率至少3%',question:'股息率尚未支持，是否改为手动设置？'}]};
    const result=validateIntent(input,raw);assert.equal(result.accepted,true);assert.equal(result.executableRules.length,0);
  }
});
test('full-input unresolved unsupported demand blocks READY',()=>{
  assert.equal(validateIntent('PE不超过20倍。且股息率至少3%。',ready()).accepted,false);
});
test('contradictory READY is blocked using the existing deterministic validator',()=>{
  const evidence='PE大于30且小于10倍。';
  const raw={outcome:'READY',conditions:[{metric:'pe_ttm',operator:'gt',value:30,evidence},{metric:'pe_ttm',operator:'lt',value:10,evidence}],issues:[]};
  assert.equal(validateIntent(evidence,raw).accepted,false);
  const clarify={...raw,outcome:'CLARIFY',issues:[{kind:'CONFLICT',evidence,question:'两个区间冲突，请确认希望保留哪一个条件？'}]};
  const result=validateIntent(evidence,clarify);assert.equal(result.accepted,true);assert.equal(result.executableRules.length,0);
});
test('UTF-16 evidence offsets preserve an emoji-containing original input',()=>{
  const evidence='PE不超过20倍。',input='🔍 '+evidence;
  const result=validateIntent(input,ready(evidence));assert.equal(result.spans[0].start,3);
  assert.equal(input.slice(result.spans[0].start,result.spans[0].end),evidence);
});
test('ambiguous requests cannot acquire invented defaults',()=>{
  assert.equal(validateIntent('稳健一点。',ready('稳健一点。',25)).accepted,false);
});
test('case corpus includes 30 unique clear, ambiguous, unsupported and adversarial cases',()=>{
  assert.equal(EVAL_CASES.length,30);assert.equal(new Set(EVAL_CASES.map(c=>c.id)).size,30);
  for(const category of ['clear','ambiguous','unsupported','contradictory','adversarial'])assert.ok(EVAL_CASES.some(c=>c.category===category));
});
