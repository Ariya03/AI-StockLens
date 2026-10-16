import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeterministicIntent } from '../lib/intent/deterministic.ts';
import { validateIntent } from '../lib/intent/validate.ts';
import { createIntentHandler } from '../lib/server/intent.ts';

const request=(input:string)=>new Request('http://localhost:3000/api/intent',{method:'POST',headers:{'Content-Type':'application/json',origin:'http://localhost:3000'},body:JSON.stringify({input})});

test('explicit PE becomes a reviewable READY proposal with original evidence',()=>{
  const parsed=parseDeterministicIntent('PE不超过20倍');
  const validation=validateIntent('PE不超过20倍',parsed,'v2');
  assert.equal(parsed.outcome,'READY');assert.equal(validation.accepted,true);
  assert.equal(validation.executableRules[0]?.value,20);assert.equal(validation.executableRules[0]?.operator,'lte');
});

test('contest-style vague intent is clarified and never guesses default thresholds',()=>{
  const input='经营改善、估值合理、走势相对稳定';
  const parsed=parseDeterministicIntent(input);
  const validation=validateIntent(input,parsed,'v2');
  assert.equal(parsed.outcome,'CLARIFY');assert.equal(validation.accepted,true);
  assert.equal(validation.executableRules.length,0);assert.ok(parsed.issues.length>=3);
});

test('OR, dividend and buy advice cannot become executable rules',()=>{
  for(const input of ['PE不超过20倍或ROE大于10%','PE不超过20倍，股息率至少3%','推荐一只明天稳赚的股票']){
    const parsed=parseDeterministicIntent(input);
    const validation=validateIntent(input,parsed,'v2');
    assert.equal(parsed.outcome,'UNSUPPORTED');assert.equal(validation.accepted,true);assert.equal(validation.executableRules.length,0);
  }
});

test('public handler uses the deterministic parser and does not invent PE>0',async()=>{
  const body=await (await createIntentHandler({enabled:()=>false})(request('帮我找市盈率不超过20倍的股票。'))).json();
  assert.equal(body.status,'READY');assert.equal(body.rules.length,1);assert.equal(body.rules[0].value,20);
  assert.ok(!body.rules.some((rule:{id:string})=>rule.id==='pe-positive'));
});
