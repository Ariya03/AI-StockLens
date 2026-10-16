import 'server-only';
import { SessionError } from './sessions.ts';
type Environment=Record<string,string|undefined>;
export const isLoopbackHost=(host:string)=>/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
export function publicDeployment(env:Environment=process.env) {
  return env.STOCKLENS_PUBLIC_DEMO==='1' || env.STOCKLENS_PUBLIC_ORIGIN!==undefined || !!env.VERCEL || !!env.RENDER;
}
export function configuredPublicOrigin(env:Environment=process.env):string|null {
  const raw=env.STOCKLENS_PUBLIC_ORIGIN;
  if(!raw) {if(publicDeployment(env))throw new SessionError('DEPLOYMENT_NOT_CONFIGURED','公开筛选服务尚未完成安全配置。',503);return null;}
  try {
    const url=new URL(raw);
    if(url.protocol!=='https:' || url.username || url.password || url.pathname!=='/' || url.search || url.hash || raw!==url.origin || isLoopbackHost(url.host))throw Error();
    return url.origin;
  }catch{throw new SessionError('DEPLOYMENT_NOT_CONFIGURED','公开筛选服务尚未完成安全配置。',503);}
}
export function requestSecurity(request:Request,env:Environment=process.env) {
  const configured=configuredPublicOrigin(env);
  const url=new URL(request.url),host=request.headers.get('host')??url.host;
  if(!configured && (!isLoopbackHost(host) || !isLoopbackHost(url.host)))throw new SessionError('DEPLOYMENT_NOT_CONFIGURED','公开筛选服务尚未完成安全配置。',503);
  const expected=configured ?? `${url.protocol}//${host}`;
  const origin=request.headers.get('origin');
  if((configured && !origin) || (origin && origin!==expected) || request.headers.get('sec-fetch-site')==='cross-site')throw new SessionError('ORIGIN_REJECTED','请在本站发起筛选请求。',403);
  // Explicit origin is the sole deployment trust anchor; forwarded headers are ignored.
  return {secureCookie:configured!==null || url.protocol==='https:'};
}
export function upstreamBudgetLimit(env:Environment=process.env):number {
  const raw=env.STOCKLENS_MAX_UPSTREAM_CALLS_24H ?? '140';
  if(!/^(?:0|[1-9]\d*)$/.test(raw) || Number(raw)>7000)throw new SessionError('DEPLOYMENT_NOT_CONFIGURED','服务端请求预算配置无效。',503);
  return Number(raw);
}
