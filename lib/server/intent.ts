import 'server-only';
import { parseWithOllama } from '../intent/ollama.ts';
import { parseDeterministicIntent } from '../intent/deterministic.ts';
import { validateIntent } from '../intent/validate.ts';
import type { IntentProposal } from '../intent/proposal.ts';
import { ACTIVE_INTENT_PROMPT } from '../intent/prompt.ts';
import type { GenerationPromptVersion } from '../intent/prompt.ts';
import { publicDeployment } from './deployment.ts';
import { requestSecurity } from './deployment.ts';
import { SessionError } from './sessions.ts';

export function localIntentEnabled(env: Record<string,string|undefined> = process.env) {
  return env.STOCKLENS_LOCAL_AI === '1' && !publicDeployment(env);
}
const state = globalThis as typeof globalThis & { stocklensIntentActive?: boolean };
const reply = (body: unknown, status = 200, headers: Record<string,string> = {}) => Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}});
export function createIntentHandler(options: { enabled?: () => boolean; parse?: (input: string, version?: GenerationPromptVersion) => Promise<{output: unknown}> } = {}) {
  return async (request: Request) => {
    const localModel = (options.enabled ?? localIntentEnabled)();
    const url = new URL(request.url);
    const host = request.headers.get('host') ?? url.host;
    try {
      if (localModel) {
        // Fixed local backend: never call hosting-server localhost for public requests.
        if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) return reply({error:'LOCAL_ONLY',reason:'实验 AI 解析仅允许在本机访问。请使用手动配置或公网程序化澄清。'},403);
        if ((request.headers.get('origin') && request.headers.get('origin') !== `${url.protocol}//${host}`) || request.headers.get('sec-fetch-site') === 'cross-site') return reply({error:'ORIGIN_REJECTED',reason:'请在本站发起解析请求。'},403);
      } else {
        requestSecurity(request);
      }
    } catch (error) {
      if (error instanceof SessionError) return reply({error:error.code,reason:error.message},error.status);
      return reply({error:'ORIGIN_REJECTED',reason:'请在本站发起解析请求。'},403);
    }
    let input: string;
    try {
      const reader=request.body?.getReader(); if(!reader) throw Error();
      const chunks:Uint8Array[]=[];let size=0;
      while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>8192){await reader.cancel();return reply({error:'BODY_TOO_LARGE',reason:'输入内容过长，请控制在 2000 字以内。'},413);}chunks.push(part.value);}
      const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).length!==1 || typeof body.input!=='string' || !body.input.trim() || body.input.length>2000) throw Error();
      input=body.input;
    } catch {return reply({error:'INVALID_INPUT',reason:'请提交 1–2000 字的投资偏好；不要包含密钥或私人持仓。'},400);}
    if(localModel && state.stocklensIntentActive) return reply({error:'AI_BUSY',reason:'本机模型正在处理请求，请稍后重试或手动配置。'},429,{'Retry-After':'10'});
    if(localModel) state.stocklensIntentActive=true;
    try {
      const result=localModel
        ? await (options.parse ?? parseWithOllama)(input,ACTIVE_INTENT_PROMPT)
        : {output:parseDeterministicIntent(input)};
      // Revalidate the raw proposal here; the adapter's validation is never trusted alone.
      const validation=validateIntent(input,result.output,'v2');
      const unsafeReady=validation.parsed?.outcome==='READY' && /(?:\bOR\b|或者|或是|或|\|\||股息|分红|行业|板块|成长|增长|经营改善|推荐|买入|卖出|MRQ|年化)/i.test(input);
      if(!validation.accepted || unsafeReady) return reply({status:'REJECTED',rules:[],evidence:[],issues:[],message:'条件提案未通过核验，不能应用为条件。请修改表述重试，或手动配置；不会自动修正阈值或补充条件。'} satisfies IntentProposal);
      const parsed=validation.parsed!;
      const ready=parsed.outcome==='READY';
      return reply({status:parsed.outcome,rules:ready?validation.executableRules:[],evidence:ready?validation.spans.map(s=>s.evidence):[],
        issues:parsed.issues.map(i=>({evidence:i.evidence,message:i.kind==='UNSUPPORTED'?'这部分意图超出当前三个指标或同时满足的筛选范围，不能执行。':i.kind==='CONFLICT'?'条件存在冲突，请明确调整后重试。':i.kind==='ADVERSARIAL'?'输入包含改变解析规则的指令，请只描述筛选条件。':'含义或数值、报告期、窗口不明确，请补充具体条件后重试。'})),
        message:ready?'提案通过有限的确定性核验。请对照原文逐条审阅，确认后才会替换编辑中的条件；不会自动筛选。':'这次解析不能形成可执行条件。请修改原文重试，或明确选择手动配置。'} satisfies IntentProposal);
    } catch(error) {
      const name=error instanceof Error?error.name:'';
      return reply({error:name==='TimeoutError'||name==='AbortError'?'AI_TIMEOUT':'AI_UNAVAILABLE',reason:name==='TimeoutError'||name==='AbortError'?'本机模型解析超时，请重试或手动配置。':'本机模型离线、响应不完整或格式异常，请检查 Ollama 后重试，或手动配置。'},503);
    } finally {state.stocklensIntentActive=false;}
  };
}
