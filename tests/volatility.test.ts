import test from 'node:test';
import assert from 'node:assert/strict';
import { volatility60 } from '../lib/metrics/volatility.ts';
import { bars, AS_OF } from './helpers.ts';
test('61 constant prices yield 60 returns and zero volatility', () => {
  assert.equal(volatility60(bars(),AS_OF).value,0);
});
test('sample SD, percent scale and no annualization are correct', () => {
  const prices=[100];
  for(let i=0;i<60;i++) prices.push(prices.at(-1)!*(i%2===0?1.01:0.99));
  const result=volatility60(bars(prices).reverse(),AS_OF);
  // 30 +1% returns, 30 -1% returns: sample SD = sqrt(60/59) percent.
  assert.ok(Math.abs(result.value!-Math.sqrt(60/59))<1e-12);
  assert.equal(result.closes?.length,61); assert.equal(result.dates?.length,61);
});
test('uses latest 61 closes without mutating input', () => {
  const input=bars([1,10,...Array(61).fill(100)]).reverse();
  const original=JSON.stringify(input);
  assert.equal(volatility60(input,AS_OF).value,0); assert.equal(JSON.stringify(input),original);
});
test('60 prices are insufficient',()=>assert.equal(volatility60(bars(Array(60).fill(100)),AS_OF).issue?.code,'INSUFFICIENT_HISTORY'));
test('duplicate dates reject history',()=>assert.equal(volatility60([...bars(),bars()[0]],AS_OF).issue?.code,'DUPLICATE_DATE'));
test('same Shanghai date with distinct timestamps rejects history',()=> {
  const input=bars(); input[1].date_ms=input[0].date_ms+1000;
  assert.equal(volatility60(input,AS_OF).issue?.code,'DUPLICATE_DATE');
});
for (const value of [null,undefined,0,-1,NaN,Infinity,'100']) test(`invalid close ${String(value)} must not be skipped`,()=> {
  const input: unknown[] = bars(); input[10]={...bars()[10],close_price:value};
  assert.equal(volatility60(input,AS_OF).issue?.code,'INVALID_CLOSE');
});
test('missing date rejects history',()=>assert.equal(volatility60([{close_price:100}],AS_OF).issue?.code,'INVALID_DATE'));
test('future bar rejects history',()=>assert.equal(volatility60(bars(),'2026-10-14').issue?.code,'FUTURE_BAR'));
test('non-array response rejects history',()=>assert.equal(volatility60(null,AS_OF).issue?.code,'MALFORMED_HISTORY'));
