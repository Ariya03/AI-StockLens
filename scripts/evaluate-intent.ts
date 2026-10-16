import { mkdir,writeFile,appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { EVAL_CASES } from '../evaluations/intent/cases.ts';
import type { EvalCase,ExpectedRule } from '../evaluations/intent/cases.ts';
import { parseWithOllama,OLLAMA_MODEL,GENERATION_OPTIONS } from '../lib/intent/ollama.ts';
import { INTENT_SCHEMA } from '../lib/intent/schema.ts';
import { buildIntentPrompt } from '../lib/intent/prompt.ts';
import type { PromptVersion } from '../lib/intent/prompt.ts';

const version=(process.argv[2] ?? 'v1') as PromptVersion;
if(!['v1','v2'].includes(version)) throw new Error('仅支持v1/v2评估');
const directory=`evaluations/intent/${version}`;
await mkdir(directory,{recursive:true});
const metadata=await Promise.all(['version','tags'].map(async path=>{
 const r=await fetch(`http://127.0.0.1:11434/api/${path}`,{signal:AbortSignal.timeout(10_000)});if(!r.ok)throw new Error('本地模型元数据不可用');return r.json();
}));
const model=metadata[1].models.find((m:{name:string})=>m.name===OLLAMA_MODEL);
if(!model)throw new Error('指定模型未安装；不会下载或切换模型');
const prompt=buildIntentPrompt(version);
await writeFile(`${directory}/system-prompt.txt`,prompt);
await writeFile(`${directory}/schema.json`,JSON.stringify(INTENT_SCHEMA,null,2));
await writeFile(`${directory}/metadata.json`,JSON.stringify({version,model,ollamaVersion:metadata[0].version,options:GENERATION_OPTIONS,
 startedAt:new Date().toISOString(),promptSha256:createHash('sha256').update(prompt).digest('hex'),schemaSha256:createHash('sha256').update(JSON.stringify(INTENT_SCHEMA)).digest('hex'),casesSha256:createHash('sha256').update(JSON.stringify(EVAL_CASES)).digest('hex'),
 safety:'仅向本机发送公开合成测试意图；不加载.env.local，不发送金融数据，不含API密钥。',
 decisionCriteria:{GO:'无逃逸关键错误；精确通过率>=95%；明确请求可用率>=90%；p95<=20秒',CONDITIONAL_GO:'无逃逸关键错误；精确通过率>=80%；明确请求可用率>=75%；人工确认与拒绝门控',NO_GO:'存在逃逸关键错误，或低于上述条件门槛'}},null,2));
await writeFile(`${directory}/results.jsonl`,'');
function tuples(output:unknown):ExpectedRule[]{
 const value=output as {conditions?:{metric:ExpectedRule[0];operator:ExpectedRule[1];value:number}[]}|null;
 return Array.isArray(value?.conditions)?value.conditions.map(c=>[c.metric,c.operator,c.value]):[];
}
const signature=(r:readonly ExpectedRule[])=>r.map(t=>JSON.stringify(t)).sort().join('|');
function judge(c:EvalCase,result:Awaited<ReturnType<typeof parseWithOllama>>) {
 const output=result.output as {outcome?:string;conditions?:unknown[]}|null;
 const actual=tuples(output);const rawCritical:string[]=[];
 for(const t of actual)if(!c.expected.conditions.some(e=>signature([e])===signature([t])))rawCritical.push(c.expected.conditions.some(e=>e[0]===t[0])?'ALTERED_THRESHOLD_OPERATOR_OR_EXTRA_BOUND':'UNSUPPORTED_EXECUTABLE_CONDITION');
 if(output?.outcome==='READY'&&c.expected.outcome!=='READY')rawCritical.push('UNRESOLVED_INTENT_MARKED_READY');
 const executable=result.validation.executableRules.map(r=>[r.metric,r.operator,r.value] as ExpectedRule);
 const escaped=executable.some(t=>!c.expected.conditions.some(e=>signature([e])===signature([t]))) || (executable.length>0&&c.expected.outcome!=='READY');
 const exact=result.validation.accepted&&output?.outcome===c.expected.outcome&&signature(actual)===signature(c.expected.conditions);
 return {exact,rawCritical:[...new Set(rawCritical)],criticalEscaped:escaped,
   missingExplicitConditions:c.expected.conditions.filter(e=>!actual.some(t=>signature([e])===signature([t]))),
   safeReady:c.expected.outcome==='READY'&&exact&&executable.length===c.expected.conditions.length};
}
const rows:Record<string,any>[]=[];
for(const c of EVAL_CASES){
 try {
  const result=await parseWithOllama(c.input,version);const verdict=judge(c,result);
  const row={...c,...result,...verdict};rows.push(row);await appendFile(`${directory}/results.jsonl`,JSON.stringify(row)+'\n');
  console.log(`${version} ${c.id} ${verdict.exact?'PASS':'FAIL'} ${result.latencyMs}ms criticalRaw=${verdict.rawCritical.length} escaped=${verdict.criticalEscaped}`);
 }catch{
  const row={...c,exact:false,rawCritical:[],criticalEscaped:false,transportFailure:true};rows.push(row);await appendFile(`${directory}/results.jsonl`,JSON.stringify(row)+'\n');console.log(`${version} ${c.id} TRANSPORT_FAILURE`);
 }
}
const latencies=rows.filter(r=>typeof r.latencyMs==='number').map(r=>r.latencyMs).sort((a,b)=>a-b);
const exact=rows.filter(r=>r.exact).length,clear=rows.filter(r=>r.category==='clear'),safeReady=clear.filter(r=>r.safeReady).length;
const criticalEscapes=rows.filter(r=>r.criticalEscaped).length;
const percentile=(p:number)=>latencies.length?latencies[Math.min(latencies.length-1,Math.ceil(latencies.length*p)-1)]:null;
const p95=percentile(.95);
const recommendation=criticalEscapes>0||exact/rows.length<.8||safeReady/clear.length<.75?'NO-GO':exact/rows.length>=.95&&safeReady/clear.length>=.9&&p95!==null&&p95<=20_000?'GO':'CONDITIONAL GO';
const summary={version,cases:rows.length,exactPasses:exact,exactRate:exact/rows.length,clearCases:clear.length,safeReady,safeReadyRate:safeReady/clear.length,
 rawCriticalCases:rows.filter(r=>r.rawCritical.length).map(r=>({id:r.id,errors:r.rawCritical})),criticalEscapes,criticalEscapedIds:rows.filter(r=>r.criticalEscaped).map(r=>r.id),
 validationRejected:rows.filter(r=>r.validation&&!r.validation.accepted).map(r=>({id:r.id,errors:r.validation.errors})),transportFailures:rows.filter(r=>r.transportFailure).length,
 latencyMs:{p50:percentile(.5),p95,max:percentile(1)},recommendation,failedCaseIds:rows.filter(r=>!r.exact).map(r=>r.id),completedAt:new Date().toISOString()};
await writeFile(`${directory}/summary.json`,JSON.stringify(summary,null,2));
await writeFile(`${directory}/failures.json`,JSON.stringify(rows.filter(r=>!r.exact),null,2));
console.log(JSON.stringify(summary));
