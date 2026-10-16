import assert from 'node:assert/strict';
import { createFuyaoClient } from '../lib/fuyao/client.ts';
import type { ApiResult, FuyaoClient } from '../lib/fuyao/client.ts';
import { fetchSnapshot } from '../lib/fuyao/snapshot.ts';
import { SnapshotStore } from '../lib/server/sessions.ts';
import { createScreeningHandlers } from '../lib/server/handlers.ts';
import { DEFAULT_RULES } from '../lib/screening/defaults.ts';

// Real provider data only. Instrument upstream calls without exposing credentials.
const upstream=createFuyaoClient();
const calls:{httpStatus:number|null;businessCode:number|null;requestId:string|null}[]=[];
async function record(pending:Promise<ApiResult>) { const r=await pending;calls.push({httpStatus:r.httpStatus,businessCode:r.businessCode,requestId:r.requestId});return r; }
const client:FuyaoClient={valuations:c=>record(upstream.valuations(c)),financials:c=>record(upstream.financials(c)),historical:(c,s,e)=>record(upstream.historical(c,s,e))};
let loads=0;
const handlers=createScreeningHandlers({store:new SnapshotStore(),loadSnapshot:()=>{loads++;return fetchSnapshot({client});}});
const request=(path:string,body:unknown,cookie?:string)=>new Request(`http://localhost${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
const peRules=DEFAULT_RULES.filter(r=>r.metric==='pe_ttm');
const response=await handlers.screen(request('/api/screen',{rules:peRules}));
assert.equal(response.status,200);
const body=await response.json();const cookie=response.headers.get('set-cookie')!.split(';')[0];
assert.equal(calls.length,7);assert.ok(calls.every(c=>c.httpStatus===200&&c.businessCode===0));
assert.ok(body.snapshot.stocks.every((s:{metrics:Record<string,{issue:unknown;value:number|null}>})=>Object.values(s.metrics).every(m=>!m.issue&&m.value!==null)));
const initialCalls=calls.length;
const relaxed=peRules.map(r=>r.id==='pe-max'?{...r,value:45,origin:'user' as const}:r);
const compareResponse=await handlers.compare(request('/api/compare',{snapshotId:body.snapshot.id,rules:relaxed},cookie));
assert.equal(compareResponse.status,200);const comparison=(await compareResponse.json()).comparison;
assert.equal(comparison.snapshotId,body.snapshot.id);assert.equal(calls.length,initialCalls);assert.equal(loads,1);
const restoredResponse=await handlers.compare(request('/api/compare',{snapshotId:body.snapshot.id,rules:peRules},cookie));
assert.equal(restoredResponse.status,200);const restored=(await restoredResponse.json()).comparison;
assert.equal(restored.before.rules.find((r:{id:string})=>r.id==='pe-max').value,25);assert.equal(calls.length,initialCalls);
console.log(JSON.stringify({liveValidation:'通过',snapshotId:body.snapshot.id,stocks:body.snapshot.stocks.map((s:{code:string;name:string;metrics:Record<string,{value:number}>})=>({code:s.code,name:s.name,metrics:Object.fromEntries(Object.entries(s.metrics).map(([id,m])=>[id,m.value]))})),initialCounts:body.result.counts,relaxedCounts:comparison.after.counts,newlyIncluded:comparison.newlyIncluded,stillIncluded:comparison.stillIncluded,upstreamCalls:initialCalls,extraComparisonUpstreamCalls:calls.length-initialCalls,snapshotLoads:loads,restoredOriginalBaseline:true,calls}));
