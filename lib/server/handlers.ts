import 'server-only';
import { fetchSnapshot } from '../fuyao/snapshot.ts';
import { screen, compareRules } from '../screening/engine.ts';
import { validateRules, RuleValidationError } from '../screening/validation.ts';
import { SnapshotStore, snapshotStore, SessionError, requestOwner, newOwner, ownerCookie } from './sessions.ts';
import type { Snapshot } from '../screening/types.ts';
import { requestSecurity, upstreamBudgetLimit } from './deployment.ts';
import { RequestGuard, requestGuard, LimitError } from './request-guard.ts';

async function readBody(request: Request): Promise<Record<string,unknown>> {
  const reader=request.body?.getReader();
  if(!reader) throw new SessionError('INVALID_JSON','请提交有效的条件数据。',400);
  const chunks: Uint8Array[]=[]; let length=0;
  while(true) {
    const {done,value}=await reader.read(); if(done) break;
    length+=value.length;
    if(length>16*1024) { await reader.cancel(); throw new SessionError('BODY_TOO_LARGE','条件内容过长，请减少条件数量。',413); }
    chunks.push(value);
  }
  let body: unknown;
  try { body=JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new SessionError('INVALID_JSON','请提交有效的条件数据。',400); }
  if(!body || typeof body!=='object' || Array.isArray(body)) throw new SessionError('INVALID_JSON','条件数据格式无效。',400);
  return body as Record<string,unknown>;
}
const response=(body:unknown,status=200,headers:Record<string,string>={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}});
function errorResponse(error: unknown) {
  if(error instanceof LimitError) return response({error:error.code,reason:error.message},429,{'Retry-After':String(error.retryAfter)});
  if(error instanceof RuleValidationError) return response({error:'INVALID_RULES',issues:error.issues},400);
  if(error instanceof SessionError) return response({error:error.code,reason:error.message},error.status);
  return response({error:'SCREENING_UNAVAILABLE',reason:'筛选服务暂不可用，请稍后重试。'},503);
}
export function createScreeningHandlers(options: { store?: SnapshotStore; loadSnapshot?: () => Promise<Snapshot>; guard?: RequestGuard } = {}) {
  const store=options.store ?? snapshotStore, load=options.loadSnapshot ?? fetchSnapshot;
  const guard=options.guard ?? requestGuard;
  return {
    async screen(request: Request) {
      let release: (()=>void) | undefined;
      let releaseBudget: (()=>void) | undefined;
      try {
        const security=requestSecurity(request);
        const owner=requestOwner(request) ?? newOwner();
        guard.request(owner,'screen');
        const body=await readBody(request);
        if(Object.keys(body).some(k=>k!=='rules')) throw new SessionError('INVALID_REQUEST','只支持提交筛选条件；数据快照由服务端生成。',400);
        const rules=validateRules(body.rules);
        release=store.reserve(owner);
        releaseBudget=guard.reserve(owner,upstreamBudgetLimit());
        const snapshot=await load(); const result=screen(snapshot,rules);
        const expiresAt=store.put(owner,snapshot,rules);
        return response({snapshot,result,session:{expiresAt},notice:'仅用于研究与筛选，不构成投资建议；演示范围为 3 只 A 股。'},200,{'Set-Cookie':ownerCookie(owner,security.secureCookie)});
      } catch(error) { return errorResponse(error); }
      finally { releaseBudget?.(); release?.(); }
    },
    async compare(request: Request) {
      try {
        requestSecurity(request);
        guard.request(requestOwner(request) ?? 'anonymous','compare');
        const body=await readBody(request);
        if(Object.keys(body).some(k=>!['rules','snapshotId'].includes(k)) || typeof body.snapshotId!=='string' || !/^[a-zA-Z0-9-]{1,80}$/.test(body.snapshotId)) throw new SessionError('INVALID_REQUEST','请提供原始快照标识和修改后的条件。',400);
        const rules=validateRules(body.rules);
        const entry=store.get(requestOwner(request),body.snapshotId);
        return response({comparison:compareRules(entry.snapshot,entry.originalRules,rules),session:{expiresAt:new Date(entry.expiresAt).toISOString()}});
      } catch(error) { return errorResponse(error); }
    },
  };
}
