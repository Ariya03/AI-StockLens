import test from 'node:test';
import assert from 'node:assert/strict';
import {createIntentHandler,localIntentEnabled} from '../lib/server/intent.ts';
import {parseWithOllama} from '../lib/intent/ollama.ts';
const request=(input:string,extra:Record<string,unknown>={},headers:Record<string,string>={},base='http://localhost:3000')=>new Request(base+'/api/intent',{method:'POST',headers:{'Content-Type':'application/json',origin:base,...headers},body:JSON.stringify({input,...extra})});
const output=(outcome='READY',conditions:unknown[]=[{metric:'pe_ttm',operator:'lte',value:20,evidence:'PE不超过20倍'}],issues:unknown[]=[])=>({outcome,conditions,issues});
function handler(raw:unknown){return createIntentHandler({enabled:()=>true,parse:(async()=>({output:raw}))});}
const ready=output();
test('public mode defaults off and cloud env blocks explicit local flag',async()=>{
  assert.equal(localIntentEnabled({}),false);assert.equal(localIntentEnabled({STOCKLENS_LOCAL_AI:'1'}),true);
  assert.equal(localIntentEnabled({STOCKLENS_LOCAL_AI:'1',VERCEL:'1'}),false);assert.equal(localIntentEnabled({STOCKLENS_LOCAL_AI:'1',RENDER:'true'}),false);
  let calls=0;const h=createIntentHandler({enabled:()=>false,parse:(async()=>{calls++;return {output:null};})});
  const response=await h(request('PE不超过20倍'));
  assert.equal(response.status,200);assert.equal(calls,0);
  const body=await response.json();
  assert.equal(body.status,'READY');assert.equal(body.rules[0].metric,'pe_ttm');assert.equal(body.rules[0].value,20);assert.deepEqual(body.evidence,['PE不超过20倍']);
});
test('input origin size field whitelist and local host rejected before model',async()=>{
  const h=handler(ready);
  assert.equal((await h(request(''))).status,400);assert.equal((await h(request('a'.repeat(2001)))).status,400);
  assert.equal((await h(request('a'.repeat(9000)))).status,413);
  assert.equal((await h(request('PE不超过20倍',{url:'http://evil',apiKey:'test-only'}))).status,400);
  assert.equal((await h(request('PE不超过20倍',{}, {origin:'https://evil'}))).status,403);
  assert.equal((await h(request('PE不超过20倍',{}, {},'https://demo.example'))).status,403);
});
test('READY preserves explicit boundary and returns evidence without raw model output',async()=>{
  const body=await (await handler(ready)(request('PE不超过20倍'))).json();
  assert.equal(body.status,'READY');assert.equal(body.rules[0].value,20);assert.equal(body.rules[0].operator,'lte');assert.equal(body.rules.length,1);assert.deepEqual(body.evidence,['PE不超过20倍']);assert.equal(body.rawText,undefined);
});
test('clarification and unsupported proposals never expose executable partial conditions',async()=>{
  for(const outcome of ['CLARIFY','UNSUPPORTED']){
    const body=await (await handler(output(outcome,ready.conditions,[{kind:outcome==='CLARIFY'?'AMBIGUOUS':'UNSUPPORTED',evidence:'稳健',question:'请明确要求？'}]))(request('PE不超过20倍，稳健'))).json();
    assert.equal(body.status,outcome);assert.deepEqual(body.rules,[]);assert.deepEqual(body.evidence,[]);
  }
});
test('invalid, reversed, OR, unsupported, unspecified reporting period output cannot execute',async()=>{
  for(const [input,raw] of [
    ['PE不超过20倍',output('READY',[{metric:'pe_ttm',operator:'lte',evidence:'PE不超过20倍',value:25}])],
    ['PE不超过20倍',output('READY',[{metric:'pe_ttm',evidence:'PE不超过20倍',operator:'gt',value:20}])],
    ['PE不超过20倍 OR 股息率大于3%',ready],
    ['PE不超过20倍或ROE大于10%',ready],
    ['PE不超过20倍，行业是银行',ready],
    ['ROE大于10%',output('READY',[{metric:'roe_annual',operator:'gt',value:10,evidence:'ROE大于10%'}])],
    ['PE不超过20倍',{...ready,stockPrices:[100]}],
    ['PE不超过20倍',null],
  ] as [string,unknown][]){const b=await (await handler(raw)(request(input))).json();assert.equal(b.status,'REJECTED');assert.deepEqual(b.rules,[]);}
});
test('offline malformed transport and timeout are safe Chinese errors',async()=>{
  for(const name of ['TypeError','TimeoutError','Error']){
    const h=createIntentHandler({enabled:()=>true,parse:(async()=>{const e=Error('secret-test-value');e.name=name;throw e;})});
    const r=await h(request('PE不超过20倍'));assert.equal(r.status,503);const text=await r.text();assert.ok(!text.includes('secret-test-value'));assert.ok(text.includes('手动配置'));
  }
});
test('one model request in flight with finally release',async()=>{
  let done!:(v:{output:unknown})=>void;
  const h=createIntentHandler({enabled:()=>true,parse:(()=>new Promise<{output:unknown}>(r=>{done=r;}))});
  const first=h(request('PE不超过20倍'));await new Promise(r=>setTimeout(r,10));
  assert.equal((await h(request('PE不超过20倍'))).status,429);done({output:ready});assert.equal((await first).status,200);
  assert.equal((await handler(ready)(request('PE不超过20倍'))).status,200);
});
test('actual adapter only sends input and registry prompt to fixed Ollama without secrets or financial payload',async()=>{
  const before=globalThis.fetch;let payload:any;
  globalThis.fetch=(async(url,options)=>{assert.equal(String(url),'http://127.0.0.1:11434/api/chat');assert.equal(options?.redirect,'error');assert.ok(options?.signal);assert.deepEqual(options?.headers,{'Content-Type':'application/json'});payload=JSON.parse(String(options?.body));return Response.json({done:true,model:'qwen2.5:3b',message:{content:JSON.stringify(ready)}});}) as typeof fetch;
  try{await parseWithOllama('PE不超过20倍','v2');assert.equal(payload.model,'qwen2.5:3b');assert.equal(payload.messages[1].content,'PE不超过20倍');assert.equal(payload.messages.length,2);assert.equal(payload.options.temperature,0);assert.ok(!JSON.stringify(payload).includes('FUYAO_API_KEY'));assert.ok(!JSON.stringify(payload).includes('600519'));}finally{globalThis.fetch=before;}
});
