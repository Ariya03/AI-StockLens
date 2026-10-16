import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../app/api/screen/route.ts';
import { GET } from '../app/api/health/route.ts';
import { rule } from './helpers.ts';
test('health does not expose credentials or connect to provider',async()=> {
  const response=GET(), body=await response.json();
  assert.equal(response.status,200); assert.equal(body.phase,1);
  assert.ok(body.notice.includes('不构成投资建议'));
});
test('malformed JSON is rejected without fetching',async()=> {
  const response=await POST(new Request('http://localhost/api/screen',{method:'POST',body:'{'}));
  assert.equal(response.status,400); assert.equal((await response.json()).error,'INVALID_JSON');
});
test('contradictions are rejected before any provider call',async()=> {
  const previous=globalThis.fetch; let calls=0;
  globalThis.fetch=(async()=>{calls++; throw new Error('must not fetch');}) as typeof fetch;
  try {
    const response=await POST(new Request('http://localhost/api/screen',{method:'POST',body:JSON.stringify({rules:[rule({id:'lo',operator:'gt',value:30}),rule({operator:'lt',value:10})]})}));
    const body=await response.json();
    assert.equal(response.status,400); assert.ok(body.issues.some((i:{code:string})=>i.code==='CONTRADICTION'));
    assert.equal(calls,0);
  } finally { globalThis.fetch=previous; }
});
