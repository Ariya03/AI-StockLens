// Local verification instrumentation only; not imported by the product.
// Records public synthetic test intents/model outputs, never financial headers/data.
import next from 'next';
import {createServer} from 'node:http';
import {mkdirSync,writeFileSync} from 'node:fs';
const port=3006;const directory='evaluations/phase3b';mkdirSync(directory,{recursive:true});
let financialCalls=0;const records:unknown[]=[];
const upstream=globalThis.fetch;
globalThis.fetch=(async(input,options)=>{
  const url=String(input);
  if(url.startsWith('https://fuyao.aicubes.cn/')){financialCalls++;console.log(`金融取数累计 ${financialCalls}`);}
  const response=await upstream(input,options);
  if(url==='http://127.0.0.1:11434/api/chat') {
    const payload=JSON.parse(String(options?.body));const result=await response.clone().json();
    records.push({at:new Date().toISOString(),input:payload.messages[1].content,model:payload.model,promptVersion:'v2',response:result});
    writeFileSync(`${directory}/browser-model-outputs.json`,JSON.stringify(records,null,2));
  }
  writeFileSync(`${directory}/upstream-count.json`,JSON.stringify({financialCalls,modelCalls:records.length}));
  return response;
}) as typeof fetch;
const app=next({dev:false,hostname:'127.0.0.1',port});await app.prepare();
const handler=app.getRequestHandler();const server=createServer((req,res)=>handler(req,res));server.listen(port,'127.0.0.1',()=>console.log('Phase 3B verification: http://127.0.0.1:3006'));
