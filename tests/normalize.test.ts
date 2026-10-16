import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePe, normalizeRoe, normalizeVolatility } from '../lib/metrics/normalize.ts';
import { api, timestamp, AS_OF, bars } from './helpers.ts';
const pe=(value:unknown,time:unknown=timestamp)=>api({timestamp:time,item:[{thscode:'600519.SH',pe_ttm:value}]});
const roe=(value:unknown,report='2025-4')=>api({thscode:'600519.SH',report,abilities:[{indicators:[{index_id:'index_weighted_avg_roe',value}]}]});
test('PE uses TTM directly, including negative values',()=> {
  assert.equal(normalizePe(pe(-10),'600519.SH',AS_OF).value,-10);
  assert.equal(normalizePe(pe(0),'600519.SH',AS_OF).value,0);
});
test('missing/invalid PE and absent stock are explicit',()=> {
  assert.equal(normalizePe(pe(null),'600519.SH',AS_OF).issue?.code,'MISSING_VALUE');
  assert.equal(normalizePe(pe('20'),'600519.SH',AS_OF).issue?.code,'INVALID_VALUE');
  assert.equal(normalizePe(pe(20),'000001.SZ',AS_OF).issue?.code,'MISSING_STOCK');
});
test('missing, invalid, old and future PE timestamps are explicit UNKNOWN causes',()=> {
  for(const time of [null,'bad']) assert.equal(normalizePe(pe(20,time),'600519.SH',AS_OF).issue?.code,'UNKNOWN_TIMESTAMP');
  assert.equal(normalizePe(pe(20,timestamp-10*86400_000),'600519.SH',AS_OF).issue?.code,'STALE');
  assert.equal(normalizePe(pe(20,timestamp+86400_000),'600519.SH',AS_OF).issue?.code,'FUTURE_TIMESTAMP');
});
test('ROE string becomes percentage value, not fraction or annualized value',()=> {
  const result=normalizeRoe(roe('32.5300'),'600519.SH');
  assert.equal(result.value,32.53); assert.equal(result.rawValue,'32.5300');
  assert.equal(result.provenance.reportPeriod,'2025-4'); assert.equal(result.provenance.providerTimestamp,null);
  assert.equal(result.provenance.disclosureDate,null); assert.equal(result.issue,null);
});
for(const value of [null,'','32%',' 32 ',32,NaN,'Infinity','0x20']) test(`ROE rejects missing/malformed ${String(value)}`,()=> {
  assert.equal(normalizeRoe(roe(value),'600519.SH').value,null);
});
test('actual ROE zero stays known zero',()=>assert.equal(normalizeRoe(roe('0'),'600519.SH').value,0));
test('wrong report or stock identity rejects ROE',()=> {
  assert.equal(normalizeRoe(roe('30','2026-2'),'600519.SH').issue?.code,'IDENTITY_MISMATCH');
  assert.equal(normalizeRoe(roe('30'),'000001.SZ').issue?.code,'IDENTITY_MISMATCH');
});
test('provider failures propagate without fake fallback',()=> {
  const result=api(null,{code:'TIMEOUT',reason:'请求超时'});
  for(const data of [normalizePe(result,'600519.SH',AS_OF),normalizeRoe(result,'600519.SH'),normalizeVolatility(result,AS_OF)]) {
    assert.equal(data.value,null); assert.equal(data.issue?.code,'TIMEOUT');
  }
});
test('derived volatility retains all 61 dates/prices and formula',()=> {
  const result=normalizeVolatility(api({timestamp,item:bars()}),AS_OF);
  assert.equal(result.value,0); assert.equal(result.issue,null);
  assert.equal(result.derivedInputs?.closes.length,61); assert.equal(result.derivedInputs?.dates.length,61);
  assert.equal(result.provenance.adjustment,'forward'); assert.equal(result.provenance.window,60);
});
test('recent metadata cannot disguise old closing-price window',()=> {
  const old=bars().map(b=>({...b,date_ms:b.date_ms-10*86400_000}));
  assert.equal(normalizeVolatility(api({timestamp,item:old}),AS_OF).issue?.code,'STALE_HISTORY');
});
