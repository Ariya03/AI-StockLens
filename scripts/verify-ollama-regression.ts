// Separate live integration regression: never mocks responses, never loads .env.local.
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseWithOllama,OLLAMA_MODEL,GENERATION_OPTIONS} from '../lib/intent/ollama.ts';
import {buildIntentPrompt,ACTIVE_INTENT_PROMPT} from '../lib/intent/prompt.ts';
import {INTENT_SCHEMA} from '../lib/intent/schema.ts';
import {createIntentHandler} from '../lib/server/intent.ts';
import type {IntentProposal} from '../lib/intent/proposal.ts';

const cases=[
  {id:'PE_LONG',input:'帮我找市盈率不超过20倍的股票。',expected:'READY',operator:'lte'},
  {id:'PE_NO_PUNCT',input:'PE不超过20倍',expected:'READY',operator:'lte'},
  {id:'PE_PUNCT',input:'PE不超过20倍。',expected:'READY',operator:'lte'},
  {id:'PE_STRICT',input:'市盈率小于20倍',expected:'READY',operator:'lt'},
  {id:'PE_NEGATION',input:'不要PE大于20倍的股票',expected:'READY',operator:'lte'},
  {id:'OR',input:'PE不超过20倍或ROE大于10%',expected:'UNSUPPORTED'},
  {id:'DIVIDEND',input:'PE不超过20倍，股息率至少3%',expected:'UNSUPPORTED'},
  {id:'AMBIGUOUS',input:'想找稳健的公司',expected:'CLARIFY'},
] as const;
const directory=`evaluations/phase3b/regression-${new Date().toISOString().replace(/[:.]/g,'-')}`;
await mkdir(directory,{recursive:true});
await writeFile(`${directory}/system-prompt.txt`,buildIntentPrompt(ACTIVE_INTENT_PROMPT));
await writeFile(`${directory}/cases.json`,JSON.stringify(cases,null,2));
await writeFile(`${directory}/schema.json`,JSON.stringify(INTENT_SCHEMA,null,2));
const rows:Record<string,unknown>[]=[];
const save=()=>writeFile(`${directory}/results.json`,JSON.stringify(rows,null,2));
try {
  const response=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(10_000)});
  if(!response.ok)throw Error('模型列表读取失败');
  const tags=await response.json();const model=tags.models?.find((m:{name:string})=>m.name===OLLAMA_MODEL);
  if(!model)throw Error('指定本机模型未安装，不会下载或切换模型');
  await writeFile(`${directory}/metadata.json`,JSON.stringify({model,promptVersion:ACTIVE_INTENT_PROMPT,validatorVersion:'v2 unchanged',options:GENERATION_OPTIONS,
    promptSha256:createHash('sha256').update(buildIntentPrompt(ACTIVE_INTENT_PROMPT)).digest('hex'),schemaSha256:createHash('sha256').update(JSON.stringify(INTENT_SCHEMA)).digest('hex'),
    safety:'只发送此文件定义的公开合成测试意图，不加载金融密钥，不调用扶摇。',rounds:2},null,2));
} catch {
  await writeFile(`${directory}/summary.json`,JSON.stringify({passed:0,attemptedCases:0,plannedCases:16,runFailed:true,transportFailure:true,reason:'本机 Ollama 不可用或指定模型未安装；预检失败并返回非零退出码，不视为跳过或通过。'},null,2));
  console.error(`FAIL: 本机 Ollama 不可用；记录 ${directory}`);process.exitCode=1;
}
if(!process.exitCode){
  for(let round=1;round<=2;round++)for(const c of cases){
    let actual:Awaited<ReturnType<typeof parseWithOllama>>|undefined;
    // Calls the real adapter from the real handler. This is instrumentation, not a mock.
    const handler=createIntentHandler({enabled:()=>true,parse:async(input,version)=>{actual=await parseWithOllama(input,version);return actual;}});
    const response=await handler(new Request('http://localhost:3000/api/intent',{method:'POST',headers:{host:'localhost:3000',origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify({input:c.input})}));
    const body=await response.json() as IntentProposal & {error?:string};
    const raw=actual?.output as {outcome?:string;conditions?:unknown[]}|null;
    const ready=c.expected==='READY';
    const rules=body.rules ?? [];
    const conditionExact=!ready || (rules.length===1 && rules[0].metric==='pe_ttm' && rules[0].operator===('operator' in c?c.operator:null) && rules[0].value===20 && rules[0].unit==='times');
    const pass=response.status===200 && actual?.validation.accepted===true && body.status===c.expected && raw?.outcome===c.expected && conditionExact && (ready || rules.length===0);
    rows.push({...c,round,rawText:actual?.rawText ?? null,output:actual?.output ?? null,validation:actual?.validation ?? null,
      apiStatus:response.status,apiResponse:body,latencyMs:actual?.latencyMs ?? null,pass,executionBlocked:rules.length===0,
      failureReason:pass?null:!actual?'TRANSPORT_FAILURE':!actual.validation.accepted?actual.validation.errors:body.status!==c.expected?'OUTCOME_MISMATCH':!conditionExact?'CONDITION_MISMATCH':'UNEXPECTED_RESULT'});
    await save();console.log(`${round} ${c.id} ${pass?'PASS':'FAIL'} expected=${c.expected} actual=${body.status??body.error} validation=${actual?.validation.errors.join(',')??'TRANSPORT_FAILURE'}`);
  }
  const passed=rows.filter(r=>r.pass).length;
  await writeFile(`${directory}/summary.json`,JSON.stringify({passed,failed:rows.length-passed,total:rows.length,directory,completedAt:new Date().toISOString(),
    recommendation:passed===rows.length?'局部回归通过；仍须人工 UAT，不改变 Phase 3A NO-GO':'存在真实模型回归失败，不可宣称 Phase 3B 完成'},null,2));
  console.log(`真实 Ollama 回归 ${passed}/${rows.length}；记录 ${directory}`);
  if(passed!==rows.length)process.exitCode=1;
}
