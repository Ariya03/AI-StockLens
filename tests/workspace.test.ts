import test from 'node:test';
import assert from 'node:assert/strict';
import { toDraft, draftRules, draftErrors, exampleDrafts, EXAMPLE_STRATEGIES, serializeStrategy, parseSavedStrategy } from '../lib/workspace/model.ts';
import { METRIC_DEFINITIONS } from '../lib/metrics/catalog.ts';
import { formatTime, formatValue, transitionExplanation } from '../lib/workspace/presentation.ts';
import { screen } from '../lib/screening/engine.ts';
import { snapshot, rule } from './helpers.ts';
test('blank threshold is invalid, never silently zero',()=>{
  const drafts=toDraft().map(r=>r.id==='pe-max'?{...r,value:''}:r);
  assert.throws(()=>draftRules(drafts)); assert.ok(draftErrors(drafts).length>0);
});
test('disabled rules do not reach engine',()=>{
  assert.ok(draftRules(exampleDrafts('valuation')).every(r=>r.metric==='pe_ttm'));
  assert.equal(draftRules(exampleDrafts('valuation')).length,2);
});
test('example strategies are explicitly suggested, not inferred from input',()=>{
  assert.equal(EXAMPLE_STRATEGIES.length,3);
  for(const example of EXAMPLE_STRATEGIES) assert.ok(draftRules(exampleDrafts(example.id)).every(r=>r.origin==='suggested'));
});
test('catalog supplies full builder metadata',()=>{
  for(const m of METRIC_DEFINITIONS){ assert.ok(m.id&&m.label&&m.description&&m.unit&&m.scopeLabel); assert.equal(m.operators.length,5);assert.equal(m.constraints.finite,true); }
});
test('dates display in Beijing time, values never show NaN',()=>{
  assert.ok(formatTime('2026-10-15T11:20:00Z').includes('19:20:00'));
  assert.equal(formatValue(null,'%'),'暂无数据'); assert.equal(formatValue(NaN,'%'),'暂无数据');
});
test('changed and unchanged membership explanations identify the changed threshold and observed value',()=>{
  const data=snapshot(30),before=screen(data,[rule()]).stocks[0],after=screen(data,[rule({value:45})]).stocks[0];
  const text=transitionExplanation(before,after);
  assert.ok(text.includes('实际值30倍'));assert.ok(text.includes('25倍'));assert.ok(text.includes('45倍'));assert.ok(text.includes('不满足 → 满足'));
});
test('saved strategies round-trip user drafts and reject forged metrics',()=>{
  const drafts=toDraft().map(r=>r.id==='pe-max'?{...r,value:'18',origin:'user' as const}:r);
  const saved=serializeStrategy('PE不超过18倍',drafts);
  assert.deepEqual(parseSavedStrategy(saved)?.drafts,drafts);
  assert.equal(parseSavedStrategy({...saved,drafts:[{...drafts[0],metric:'dividend'}]}),null);
});
test('dynamic condition identifiers are hidden in Chinese validation errors',()=>{
  const drafts=toDraft().map(r=>r.id==='pe-positive'?{...r,id:'pe_ttm-added-id',value:'30'}:r);
  const errors=draftErrors(drafts).join('；');
  assert.ok(errors.includes('第 1 项条件'));assert.ok(errors.includes('大于'));assert.ok(!errors.includes('added-id'));
});
