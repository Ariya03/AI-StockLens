import test from 'node:test';
import assert from 'node:assert/strict';
import { createFuyaoClient } from '../lib/fuyao/client.ts';
import { fetchSnapshot } from '../lib/fuyao/snapshot.ts';
import { screen } from '../lib/screening/engine.ts';
import { rule, NOW, AS_OF, timestamp, bars } from './helpers.ts';
const fetcher=(body:unknown,status=200)=> (async()=>new Response(JSON.stringify(body),{status})) as typeof fetch;
test('successful adapter checks business code and sends key server-side only',async()=> {
  const client=createFuyaoClient({apiKey:'unit-test-only',fetcher:(async(url,options)=> {
    assert.ok(String(url).startsWith('https://fuyao.aicubes.cn/api/'));
    assert.ok(!String(url).includes('unit-test-only')); assert.equal(new Headers(options?.headers).get('X-api-key'),'unit-test-only');
    assert.equal(options?.redirect,'error');
    return new Response(JSON.stringify({code:0,request_id:'id123',data:{item:[]}}));
  }) as typeof fetch});
  const result=await client.valuations(['600519.SH']);
  assert.equal(result.issue,null); assert.equal(result.businessCode,0); assert.equal(result.httpStatus,200);
});
test('missing key avoids calling provider',async()=> {
  const result=await createFuyaoClient({apiKey:' ',fetcher:(async()=>{throw new Error('must not call');}) as typeof fetch}).valuations([]);
  assert.equal(result.issue?.code,'MISSING_KEY');
});
test('HTTP 429 and HTTP 500 are errors',async()=> {
  for(const status of [429,500]) assert.equal((await createFuyaoClient({apiKey:'test',fetcher:fetcher({},status)}).valuations([])).issue?.code,'HTTP_ERROR');
});
test('HTTP 200 business error rejects returned data and redacts upstream messages',async()=> {
  const result=await createFuyaoClient({apiKey:'unit-secret',fetcher:fetcher({code:2003,message:'unit-secret',data:{pe_ttm:99}})}).valuations([]);
  assert.equal(result.issue?.code,'BUSINESS_ERROR'); assert.equal(result.data,null); assert.ok(!JSON.stringify(result).includes('unit-secret'));
});
test('invalid JSON and malformed envelopes are errors',async()=> {
  const invalid=createFuyaoClient({apiKey:'test',fetcher:(async()=>new Response('<html>')) as typeof fetch});
  assert.equal((await invalid.valuations([])).issue?.code,'INVALID_JSON');
  for(const body of [null,[],{data:{}},{code:'0',data:{}},{code:0,data:null}]) assert.ok((await createFuyaoClient({apiKey:'test',fetcher:fetcher(body)}).valuations([])).issue);
});
test('network exception text cannot leak credentials',async()=> {
  const result=await createFuyaoClient({apiKey:'unit-secret',fetcher:(async()=>{throw new Error('unit-secret');}) as typeof fetch}).valuations([]);
  assert.equal(result.issue?.code,'NETWORK_ERROR'); assert.ok(!JSON.stringify(result).includes('unit-secret'));
});
test('timeout produces explicit unknown data reason',async()=> {
  const result=await createFuyaoClient({apiKey:'test',fetcher:(async()=>{throw new DOMException('timeout','TimeoutError');}) as typeof fetch}).valuations([]);
  assert.equal(result.issue?.code,'TIMEOUT');
});
test('configured deadline actually aborts an in-flight request',async()=> {
  const client=createFuyaoClient({apiKey:'test',timeoutMs:5,fetcher:((_url,options)=>new Promise((_resolve,reject)=> {
    const keepAlive=setTimeout(()=>reject(new Error('abort not observed')),200);
    options!.signal!.addEventListener('abort',()=>{ clearTimeout(keepAlive); reject(options!.signal!.reason); },{once:true});
  })) as typeof fetch});
  assert.equal((await client.valuations([])).issue?.code,'TIMEOUT');
});
test('snapshot preserves successful metrics when one upstream fails, and is deeply immutable',async()=> {
  let calls=0;
  const client=createFuyaoClient({apiKey:'test',now:()=>NOW,fetcher:(async(input)=> {
    calls++; const url=new URL(String(input)); const code=url.searchParams.get('thscode');
    if(url.pathname.includes('valuations')) return new Response(JSON.stringify({code:0,data:{timestamp,item:['600519.SH','000001.SZ','300033.SZ'].map(thscode=>({thscode,pe_ttm:20}))}}));
    if(url.pathname.includes('financials')) return new Response(JSON.stringify({code:5003,message:'upstream unavailable',data:null}));
    return new Response(JSON.stringify({code:0,data:{timestamp,item:bars()}}));
  }) as typeof fetch});
  const snapshot=await fetchSnapshot({client,now:NOW,asOf:AS_OF});
  assert.equal(calls,7); assert.equal(snapshot.stocks.length,3);
  assert.equal(snapshot.stocks[0].metrics.pe_ttm.value,20); assert.equal(snapshot.stocks[0].metrics.roe_annual.value,null);
  assert.equal(snapshot.stocks[0].metrics.daily_volatility_60d.value,0);
  assert.ok(Object.isFrozen(snapshot.stocks[0].metrics.pe_ttm.provenance));
  assert.throws(()=>{(snapshot.stocks[0].metrics.pe_ttm as {value:number|null}).value=1;},TypeError);
  const result=screen(snapshot,[rule({metric:'roe_annual',unit:'percent',period:'2025-4',value:10})]);
  assert.equal(result.counts.UNKNOWN,3);
});
test('past snapshots are rejected instead of mixing current PE with historic prices',async()=> {
  await assert.rejects(fetchSnapshot({asOf:'2026-10-14',now:NOW}),/历史时点/);
  await assert.rejects(fetchSnapshot({asOf:'2026-02-30',now:NOW}));
});
