import 'server-only';
import { INTENT_SCHEMA } from './schema.ts';
import { buildIntentPrompt, ACTIVE_INTENT_PROMPT } from './prompt.ts';
import type { GenerationPromptVersion } from './prompt.ts';
import { validateIntent } from './validate.ts';

export const OLLAMA_MODEL='qwen2.5:3b';
export const GENERATION_OPTIONS={temperature:0,seed:42,num_ctx:8192,num_predict:1200} as const;
export async function parseWithOllama(input:string,version:GenerationPromptVersion=ACTIVE_INTENT_PROMPT) {
  if(!input.trim()||input.length>2000) throw new Error('输入必须为 1–2000 字符');
  const started=performance.now();
  const response=await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',
    body:JSON.stringify({model:OLLAMA_MODEL,messages:[{role:'system',content:buildIntentPrompt(version)},{role:'user',content:input}],format:INTENT_SCHEMA,stream:false,keep_alive:'10m',options:GENERATION_OPTIONS}),signal:AbortSignal.timeout(90_000)});
  if(!response.ok) throw new Error(`本地模型 HTTP ${response.status}`);
  const body=await response.json();
  if(!body.done||body.done_reason==='length'||typeof body.message?.content!=='string') throw new Error('本地模型输出未完整结束');
  const text=body.message.content;
  let output:unknown;try{output=JSON.parse(text);}catch{output=null;}
  // New prompts change generation only; preserve every V2 validation gate.
  return {rawText:text,output,validation:validateIntent(input,output,version==='v1'?'v1':'v2'),latencyMs:Math.round(performance.now()-started),model:body.model,
    doneReason:body.done_reason,promptTokens:body.prompt_eval_count,outputTokens:body.eval_count};
}
