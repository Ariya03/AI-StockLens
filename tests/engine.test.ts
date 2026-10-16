import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRule, aggregate, screen, compareRules } from '../lib/screening/engine.ts';
import { metric, rule, snapshot } from './helpers.ts';
test('all five comparisons preserve exact threshold behavior',()=> {
  for(const [operator,expected] of [['gt','FAIL'],['gte','PASS'],['lt','FAIL'],['lte','PASS'],['eq','PASS']] as const)
    assert.equal(evaluateRule(rule({operator,value:20}),metric(20)).status,expected);
});
test('missing / invalid / stale values remain UNKNOWN',()=> {
  for(const data of [metric(null),metric(NaN),metric(10,{issue:{code:'STALE',reason:'过期'}})]) {
    assert.equal(evaluateRule(rule(),data).status,'UNKNOWN');
  }
});
test('negative and zero PE fail an explicit positive PE rule',()=> {
  for(const value of [-1,0]) assert.equal(evaluateRule(rule({operator:'gt',value:0}),metric(value)).status,'FAIL');
});
test('unit and financial period mismatch yield UNKNOWN',()=> {
  assert.equal(evaluateRule(rule({metric:'roe_annual',period:'2025-4',unit:'percent'}),metric(20)).status,'UNKNOWN');
});
test('AND aggregation truth table: FAIL dominates UNKNOWN',()=> {
  assert.equal(aggregate([{status:'PASS'},{status:'PASS'}]),'INCLUDED');
  assert.equal(aggregate([{status:'PASS'},{status:'UNKNOWN'}]),'UNKNOWN');
  assert.equal(aggregate([{status:'FAIL'},{status:'UNKNOWN'}]),'EXCLUDED');
  assert.equal(aggregate([{status:'FAIL'},{status:'PASS'}]),'EXCLUDED');
  assert.throws(()=>aggregate([]));
});
test('every exclusion includes comparison and original provenance',()=> {
  const result=screen(snapshot(30),[rule()]);
  assert.equal(result.stocks[0].status,'EXCLUDED'); assert.equal(result.stocks[0].rules[0].actualValue,30);
  assert.equal(result.stocks[0].rules[0].evidence.provenance.requestId,'test-request');
});
test('what-if evaluates one snapshot, tracks changes and performs no data calls',()=> {
  const data=snapshot(30), original=JSON.stringify(data);
  const diff=compareRules(data,[rule()],[rule({value:45})]);
  assert.deepEqual(diff.newlyIncluded,['600519.SH']); assert.deepEqual(diff.changedRuleIds,['pe-max']);
  assert.equal(diff.before.snapshotId,diff.after.snapshotId); assert.equal(JSON.stringify(data),original);
  assert.deepEqual(compareRules(data,[rule({value:45})],[rule()]).noLongerIncluded,['600519.SH']);
});
test('UNKNOWN transitions are explicit, never treated as FAIL',()=> {
  const data=snapshot(30);
  const unknownRule=rule({id:'roe',metric:'roe_annual',unit:'percent',period:'2025-4',value:10});
  const diff=compareRules(data,[rule()],[unknownRule]);
  assert.deepEqual(diff.unknownTransitions,[{code:'600519.SH',before:'EXCLUDED',after:'UNKNOWN'}]);
});
test('JSON property ordering alone is not a changed condition',()=> {
  const original=rule();
  const reordered={origin:original.origin,unit:original.unit,value:original.value,operator:original.operator,metric:original.metric,id:original.id};
  assert.deepEqual(compareRules(snapshot(),[original],[reordered]).changedRuleIds,[]);
});
