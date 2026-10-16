import test from 'node:test';
import assert from 'node:assert/strict';
import { createScreeningHandlers as buildHandlers } from '../lib/server/handlers.ts';
import { RequestGuard } from '../lib/server/request-guard.ts';
const createScreeningHandlers=(options:NonNullable<Parameters<typeof buildHandlers>[0]>)=>buildHandlers({...options,guard:options.guard??new RequestGuard()});
import { SnapshotStore } from '../lib/server/sessions.ts';
import { snapshot, rule, metric } from './helpers.ts';
const req=(path:string,body:unknown,cookie?:string,origin?:string)=>new Request(`http://localhost${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{}),...(origin?{origin}:{})},body:JSON.stringify(body)});
test('execute then compare preserves server snapshot and never fetches new data',async()=>{
  let loads=0;const data=snapshot(30);
  const handlers=createScreeningHandlers({store:new SnapshotStore(),loadSnapshot:async()=>{loads++;return data;}});
  const executed=await handlers.screen(req('/api/screen',{rules:[rule()]}));assert.equal(executed.status,200);
  const original=await executed.json();const cookie=executed.headers.get('set-cookie')!.split(';')[0];
  assert.ok(executed.headers.get('set-cookie')!.includes('HttpOnly'));assert.ok(executed.headers.get('set-cookie')!.includes('SameSite=Strict'));
  assert.equal(original.result.stocks[0].status,'EXCLUDED');
  for(const threshold of [45,20,50]){
    const compared=await handlers.compare(req('/api/compare',{snapshotId:data.id,rules:[rule({value:threshold})]},cookie));
    assert.equal(compared.status,200);const body=await compared.json();
    assert.equal(body.comparison.snapshotId,original.snapshot.id);assert.equal(body.comparison.before.rules[0].value,25);
  }
  assert.equal(loads,1);
});
test('unknown data remains visible through screen and comparison',async()=>{
  const base=snapshot();const bad={...base,stocks:base.stocks.map(s=>({...s,metrics:{...s.metrics,pe_ttm:metric(null,{issue:{code:'TIMEOUT',reason:'请求超时'}})}}))};
  const handlers=createScreeningHandlers({store:new SnapshotStore(),loadSnapshot:async()=>bad});
  const response=await handlers.screen(req('/api/screen',{rules:[rule()]}));const body=await response.json();
  assert.equal(body.result.counts.UNKNOWN,1);assert.equal(body.result.stocks[0].rules[0].evidence.issue.code,'TIMEOUT');
});
test('client-forged snapshot or original conditions are rejected',async()=>{
  let loads=0;const handlers=createScreeningHandlers({loadSnapshot:async()=>{loads++;return snapshot();}});
  assert.equal((await handlers.screen(req('/api/screen',{rules:[rule()],snapshot:snapshot()}))).status,400);
  assert.equal((await handlers.compare(req('/api/compare',{snapshotId:'test-snapshot',rules:[rule()],beforeRules:[]}))).status,400);
  assert.equal(loads,0);
});
test('another browser cannot compare a known snapshot ID',async()=>{
  const handlers=createScreeningHandlers({store:new SnapshotStore(),loadSnapshot:async()=>snapshot()});
  const response=await handlers.screen(req('/api/screen',{rules:[rule()]}));const body=await response.json();
  const compared=await handlers.compare(req('/api/compare',{snapshotId:body.snapshot.id,rules:[rule()]}));
  assert.equal(compared.status,404);
});
test('expired sessions return 410 without calling provider again',async()=>{
  let now=0,loads=0;const store=new SnapshotStore({now:()=>now,ttlMs:10});
  const handlers=createScreeningHandlers({store,loadSnapshot:async()=>{loads++;return snapshot();}});
  const response=await handlers.screen(req('/api/screen',{rules:[rule()]}));const cookie=response.headers.get('set-cookie')!.split(';')[0];now=10;
  const compared=await handlers.compare(req('/api/compare',{snapshotId:'test-snapshot',rules:[rule()]},cookie));
  assert.equal(compared.status,410);assert.equal(loads,1);
});
test('cross-origin and oversized requests do not fetch data',async()=>{
  let loads=0;const handlers=createScreeningHandlers({loadSnapshot:async()=>{loads++;return snapshot();}});
  assert.equal((await handlers.screen(req('/api/screen',{rules:[rule()]},undefined,'https://other.example'))).status,403);
  assert.equal((await handlers.screen(req('/api/screen',{rules:[rule()],filler:'x'.repeat(17000)}))).status,413);
  assert.equal(loads,0);
});
test('unexpected provider failure releases busy reservation and remains sanitized',async()=>{
  let clock=0;
  const handlers=createScreeningHandlers({store:new SnapshotStore(),guard:new RequestGuard({now:()=>clock}),loadSnapshot:async()=>{throw new Error('private-error-message');}});
  const request=req('/api/screen',{rules:[rule()]},`stocklens-session=${'a'.repeat(64)}`);
  const response=await handlers.screen(request);assert.equal(response.status,503);
  assert.ok(!(await response.text()).includes('private-error-message'));
  clock=10_000; // Retry after the new cooldown; verify both reservations were released.
  assert.equal((await handlers.screen(req('/api/screen',{rules:[rule()]},`stocklens-session=${'a'.repeat(64)}`))).status,503);
});
test('local browser Host is accepted even when Next uses an internal localhost URL',async()=>{
  const handlers=createScreeningHandlers({store:new SnapshotStore(),loadSnapshot:async()=>snapshot()});
  const request=new Request('http://localhost:3005/api/screen',{method:'POST',headers:{'Content-Type':'application/json','Host':'127.0.0.1:3005','Origin':'http://127.0.0.1:3005','Sec-Fetch-Site':'same-origin'},body:JSON.stringify({rules:[rule()]})});
  assert.equal((await handlers.screen(request)).status,200);
});
