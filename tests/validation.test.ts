import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRules, RuleValidationError } from '../lib/screening/validation.ts';
import { rule } from './helpers.ts';

test('preserves explicit PE 20 and provenance origin', () => {
  const result = validateRules([rule({ value: 20 })]);
  assert.equal(result[0].value,20); assert.equal(result[0].origin,'user');
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result[0]));
});
for (const input of [[],null,[rule({ value: NaN })],[rule({ value: Infinity })],[{...rule(),value:'20'}],
  [{...rule(),metric:'net_profit_yoy_growth_ratio'}], [{...rule(),unit:'percent'}],
  [{...rule(),operator:'between'}], [{...rule(),origin:'ai'}],
  [rule(),rule()], [{...rule(),extra:1}], [{...rule(),period:'2025-4'}],
  [{...rule(),metric:'roe_annual',unit:'percent',period:'2026-2'}],
  [{...rule(),metric:'roe_annual',unit:'percent'}],
  [{...rule(),metric:'daily_volatility_60d',unit:'percent',window:59}],
  [{...rule(),metric:'daily_volatility_60d',unit:'percent',window:60,value:-1}],
  Array.from({length:21},(_,i)=>rule({id:String(i)}))]) {
  test(`rejects invalid condition schema ${JSON.stringify(input)}`, () => assert.throws(()=>validateRules(input),RuleValidationError));
}
for (const pair of [
  [rule({id:'lower',operator:'gt',value:30}),rule({operator:'lt',value:10})],
  [rule({id:'lower',operator:'gte',value:10}),rule({operator:'lt',value:10})],
  [rule({id:'eq',operator:'eq',value:10}),rule({operator:'eq',value:11})],
  [rule({id:'eq',operator:'eq',value:10}),rule({operator:'gt',value:10})],
]) test('contradictory interval is blocked with specific explanation', () => {
  assert.throws(()=>validateRules(pair),(e: unknown) => e instanceof RuleValidationError && e.issues.some(i=>i.code==='CONTRADICTION' && i.reason.includes('pe_ttm')));
});
test('inclusive singleton interval is executable', () => {
  assert.equal(validateRules([rule({id:'lo',operator:'gte',value:10}),rule({operator:'lte',value:10})]).length,2);
});
test('zero volatility cannot be strictly less than zero', () => {
  assert.throws(()=>validateRules([rule({metric:'daily_volatility_60d',operator:'lt',unit:'percent',window:60,value:0})]),RuleValidationError);
});
