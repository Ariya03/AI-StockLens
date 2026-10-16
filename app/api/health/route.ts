import { configuredPublicOrigin, upstreamBudgetLimit, isLoopbackHost } from '../../../lib/server/deployment.ts';
export const runtime = 'nodejs';
export function GET(request?:Request) {
  const issues:string[]=[];
  if(!process.env.FUYAO_API_KEY?.trim() || /[\r\n]/.test(process.env.FUYAO_API_KEY??''))issues.push('FINANCIAL_DATA_NOT_CONFIGURED');
  try{
    const origin=configuredPublicOrigin();upstreamBudgetLimit();
    if(request && !origin && !isLoopbackHost(request.headers.get('host')??new URL(request.url).host))throw Error();
  }catch{issues.push('DEPLOYMENT_NOT_CONFIGURED');}
  return Response.json({ product: 'AI StockLens', phase: 1, status: 'ok', configuration:{ready:issues.length===0,issues},upstream:'not-checked', notice: '仅用于研究与筛选，不构成投资建议' },{headers:{'Cache-Control':'no-store'}});
}
