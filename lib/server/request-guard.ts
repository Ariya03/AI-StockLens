import 'server-only';
import { SessionError } from './sessions.ts';
import { UNIVERSE } from '../fuyao/snapshot.ts';
export const SCREEN_UPSTREAM_COST=1+2*UNIVERSE.length;
export class LimitError extends SessionError {
  readonly retryAfter:number;
  constructor(code:string,message:string,retryAfter:number){super(code,message,429);this.retryAfter=Math.max(1,Math.ceil(retryAfter));}
}
export class RequestGuard {
  private windows=new Map<string,{start:number;count:number}>();
  private spending:{at:number;cost:number}[]=[];
  private active=0;
  private cooldown=new Map<string,number>();
  private now:()=>number;
  constructor(options:{now?:()=>number}={}){this.now=options.now??Date.now;}
  private check(key:string,limit:number){
    const now=this.now();let entry=this.windows.get(key);
    if(!entry || now-entry.start>=60_000){entry={start:now,count:0};this.windows.set(key,entry);}
    if(entry.count>=limit)throw new LimitError('RATE_LIMITED','操作过于频繁，请稍后重试。',(60_000-(now-entry.start))/1000);
    entry.count++;
  }
  request(owner:string,mode:'screen'|'compare'){
    const now=this.now();
    for(const [key,value] of this.windows)if(now-value.start>=60_000)this.windows.delete(key);
    for(const [key,time] of this.cooldown)if(now-time>=10_000)this.cooldown.delete(key);
    if(this.windows.size>=1000 && !this.windows.has(`owner:${owner}`))throw new LimitError('RATE_LIMITED','请求较多，请稍后重试。',60);
    this.check('global:all',60);
    this.check(`owner:${owner}`,30);
    if(mode==='screen')this.check('global:screen',6);
  }
  reserve(owner:string,budget:number):()=>void {
    const now=this.now();this.spending=this.spending.filter(entry=>now-entry.at<24*3600_000);
    const last=this.cooldown.get(owner);
    if(last!==undefined && now-last<10_000)throw new LimitError('SCREEN_COOLDOWN','刚刚已获取数据，请稍后再刷新；也可使用原快照比较条件。',(10_000-(now-last))/1000);
    if(this.active>=2)throw new LimitError('BUSY','金融数据请求较多，请稍后重试。',10);
    if(this.spending.reduce((sum,e)=>sum+e.cost,0)+SCREEN_UPSTREAM_COST>budget)throw new LimitError('UPSTREAM_BUDGET_EXHAUSTED','演示服务的金融数据请求预算已用完，请稍后重试；已有快照仍可比较。',this.spending.length?(this.spending[0].at+24*3600_000-now)/1000:86400);
    // Reserve the whole seven-call path before any upstream call. Never refund failures.
    this.spending.push({at:now,cost:SCREEN_UPSTREAM_COST});this.cooldown.set(owner,now);this.active++;
    let released=false;return ()=>{if(!released){this.active--;released=true;}};
  }
}
declare global {var stocklensRequestGuard:RequestGuard|undefined;}
export const requestGuard=globalThis.stocklensRequestGuard??=new RequestGuard();
