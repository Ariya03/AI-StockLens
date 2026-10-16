import test,{afterEach} from 'node:test';import assert from 'node:assert/strict';
import {configuredPublicOrigin,requestSecurity,upstreamBudgetLimit} from '../lib/server/deployment.ts';
import {RequestGuard,SCREEN_UPSTREAM_COST,LimitError} from '../lib/server/request-guard.ts';
import {createScreeningHandlers} from '../lib/server/handlers.ts';
import {SnapshotStore} from '../lib/server/sessions.ts';
import {localIntentEnabled,createIntentHandler} from '../lib/server/intent.ts';
import {snapshot,rule} from './helpers.ts';
const priorOrigin=process.env.STOCKLENS_PUBLIC_ORIGIN;
afterEach(()=>{if(priorOrigin===undefined)delete process.env.STOCKLENS_PUBLIC_ORIGIN;else process.env.STOCKLENS_PUBLIC_ORIGIN=priorOrigin;});
const req=(body:unknown,headers:Record<string,string>={},path='/api/screen')=>new Request('http://internal:3000'+path,{method:'POST',headers:{host:'demo.example',origin:'https://demo.example','content-type':'application/json',...headers},body:JSON.stringify(body)});
test('configured HTTPS origin accepts internal HTTP and ignores forwarded spoofing',async()=>{
 process.env.STOCKLENS_PUBLIC_ORIGIN='https://demo.example';let loads=0;
 const handlers=createScreeningHandlers({store:new SnapshotStore(),guard:new RequestGuard(),loadSnapshot:async()=>{loads++;return snapshot();}});
 const response=await handlers.screen(req({rules:[rule()]},{'x-forwarded-proto':'http','x-forwarded-host':'evil.example'}));assert.equal(response.status,200);assert.ok(response.headers.get('set-cookie')?.includes('; Secure'));
 const cookie=response.headers.get('set-cookie')!.split(';')[0];
 const compared=await handlers.compare(req({snapshotId:'test-snapshot',rules:[rule({value:45})]},{cookie},'/api/compare'));assert.equal(compared.status,200);assert.equal(loads,1);
});
test('wrong missing null and cross-site origins cannot spend upstream budget',async()=>{
 process.env.STOCKLENS_PUBLIC_ORIGIN='https://demo.example';let loads=0;
 const handlers=createScreeningHandlers({guard:new RequestGuard(),loadSnapshot:async()=>{loads++;return snapshot();}});
 for(const origin of ['https://evil.example','null','']){
  const request=req({rules:[rule()]},{origin,'x-forwarded-host':'demo.example','x-forwarded-proto':'https'});if(!origin)request.headers.delete('origin');
  assert.equal((await handlers.screen(request)).status,403);
 }
 assert.equal((await handlers.screen(req({rules:[rule()]},{'sec-fetch-site':'cross-site'}))).status,403);assert.equal(loads,0);
});
test('invalid or missing public origin fails closed without trusting Host or forwarded headers',()=>{
 for(const origin of ['http://demo.example','https://demo.example/','https://u:p@demo.example','https://demo.example/path'])assert.throws(()=>configuredPublicOrigin({STOCKLENS_PUBLIC_ORIGIN:origin}));
 assert.throws(()=>configuredPublicOrigin({RENDER:'true'}));assert.throws(()=>requestSecurity(req({}),{}));
 assert.equal(requestSecurity(new Request('http://localhost/api/screen'),{}).secureCookie,false);
});
test('public mode disables local model even with accidental opt-in and loopback origin',async()=>{
 for(const env of [{STOCKLENS_LOCAL_AI:'1',STOCKLENS_PUBLIC_DEMO:'1'},{STOCKLENS_LOCAL_AI:'1',STOCKLENS_PUBLIC_ORIGIN:'https://demo.example'}])assert.equal(localIntentEnabled(env),false);
 assert.equal(localIntentEnabled({STOCKLENS_LOCAL_AI:'1'}),true);
 process.env.STOCKLENS_PUBLIC_ORIGIN='https://demo.example';
 const response=await createIntentHandler()(new Request('http://localhost/api/intent',{method:'POST',body:JSON.stringify({input:'PE不超过20倍'})}));assert.equal(response.status,503);assert.equal((await response.json()).error,'AI_DISABLED');
});
test('rotating owners cannot exceed global screen limit; compare remains possible',()=>{
 const guard=new RequestGuard();for(let i=0;i<6;i++)guard.request('owner'+i,'screen');assert.throws(()=>guard.request('rotated','screen'),LimitError);guard.request('owner','compare');
});
test('bounded global request limit applies to compare as well',()=>{
 const guard=new RequestGuard();for(let i=0;i<60;i++)guard.request('owner'+i,'compare');assert.throws(()=>guard.request('another','compare'),LimitError);
});
test('budget pre-reserves seven calls, failures cannot refund, and rolls after 24h',()=>{
 let now=0;const guard=new RequestGuard({now:()=>now});assert.equal(SCREEN_UPSTREAM_COST,7);
 const release=guard.reserve('first',7);release();release();assert.throws(()=>guard.reserve('rotated',7),(e:unknown)=>e instanceof LimitError&&e.code==='UPSTREAM_BUDGET_EXHAUSTED');
 now=24*3600_000;guard.reserve('new',7)();assert.throws(()=>upstreamBudgetLimit({STOCKLENS_MAX_UPSTREAM_CALLS_24H:'invalid'}));assert.equal(upstreamBudgetLimit({STOCKLENS_MAX_UPSTREAM_CALLS_24H:'0'}),0);
});
test('cooldown and at-most-two active screens have finally-safe release',()=>{
 let now=0;const guard=new RequestGuard({now:()=>now});const a=guard.reserve('a',140),b=guard.reserve('b',140);assert.throws(()=>guard.reserve('c',140),LimitError);a();assert.throws(()=>guard.reserve('a',140),LimitError);guard.reserve('c',140)();b();now=10_000;guard.reserve('a',140)();
});
test('HTTP 429 carries Retry-After, budget rejects before loader and compare uses saved snapshot',async()=>{
 process.env.STOCKLENS_PUBLIC_ORIGIN='https://demo.example';let loads=0;const guard=new RequestGuard();
 const before=process.env.STOCKLENS_MAX_UPSTREAM_CALLS_24H;process.env.STOCKLENS_MAX_UPSTREAM_CALLS_24H='7';
 try{
  const handlers=createScreeningHandlers({store:new SnapshotStore(),guard,loadSnapshot:async()=>{loads++;return snapshot();}});
  const first=await handlers.screen(req({rules:[rule()]}));assert.equal(first.status,200);const cookie=first.headers.get('set-cookie')!.split(';')[0];
  const denied=await handlers.screen(req({rules:[rule()]}));assert.equal(denied.status,429);assert.ok(denied.headers.get('retry-after'));assert.equal(loads,1);
  const compare=await handlers.compare(req({snapshotId:'test-snapshot',rules:[rule({value:45})]},{cookie},'/api/compare'));assert.equal(compare.status,200);assert.equal(loads,1);
 }finally{if(before===undefined)delete process.env.STOCKLENS_MAX_UPSTREAM_CALLS_24H;else process.env.STOCKLENS_MAX_UPSTREAM_CALLS_24H=before;}
});
