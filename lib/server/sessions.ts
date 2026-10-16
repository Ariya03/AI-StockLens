import 'server-only';
import { randomBytes } from 'node:crypto';
import { deepFreeze } from '../fuyao/snapshot.ts';
import type { Rule, Snapshot } from '../screening/types.ts';

export const SESSION_TTL_MS = 15*60_000;
export const SESSION_COOKIE = 'stocklens-session';
export class SessionError extends Error {
  readonly status: number; readonly code: string;
  constructor(code: string, message: string, status: number) { super(message); this.code=code; this.status=status; }
}
type Entry = Readonly<{ owner: string; snapshot: Snapshot; originalRules: readonly Rule[]; expiresAt: number }>;
export class SnapshotStore {
  private entries = new Map<string,Entry>();
  private active = new Set<string>();
  private now: () => number;
  private maxEntries: number;
  private ttl: number;
  constructor(options: { now?: () => number; maxEntries?: number; ttlMs?: number } = {}) {
    this.now=options.now ?? Date.now; this.maxEntries=options.maxEntries ?? 100; this.ttl=options.ttlMs ?? SESSION_TTL_MS;
  }
  private prune() { for (const [id,e] of this.entries) if(e.expiresAt<=this.now()) this.entries.delete(id); }
  reserve(owner: string): () => void {
    if(this.active.has(owner) || this.active.size>=8) throw new SessionError('BUSY','数据请求较多，请稍后重试。',429);
    this.active.add(owner); return () => { this.active.delete(owner); };
  }
  put(owner: string, snapshot: Snapshot, originalRules: readonly Rule[]) {
    this.prune();
    if(Buffer.byteLength(JSON.stringify(snapshot))>128*1024) throw new SessionError('SNAPSHOT_TOO_LARGE','数据快照过大，暂时无法保存。',503);
    const owned=[...this.entries].filter(([,e])=>e.owner===owner);
    if(owned.length>=3) this.entries.delete(owned[0][0]);
    if(this.entries.size>=this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
    const expiresAt=this.now()+this.ttl;
    const entry=deepFreeze({owner,snapshot,originalRules:originalRules.map(r=>({...r})),expiresAt});
    this.entries.set(snapshot.id,entry);
    return new Date(expiresAt).toISOString();
  }
  get(owner: string | null, id: string): Entry {
    const entry=this.entries.get(id);
    if(!entry || !owner || entry.owner!==owner) throw new SessionError('SNAPSHOT_UNAVAILABLE','此快照不可用，请重新获取数据并筛选。',404);
    if(entry.expiresAt<=this.now()) { this.entries.delete(id); throw new SessionError('SNAPSHOT_EXPIRED','快照已过期，请重新获取数据；新旧结果不能视为同一快照比较。',410); }
    return entry;
  }
  get size() { this.prune(); return this.entries.size; }
}
declare global { var stocklensSnapshotStore: SnapshotStore | undefined; }
export const snapshotStore = globalThis.stocklensSnapshotStore ??= new SnapshotStore();
export function requestOwner(request: Request): string | null {
  const match=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length+1);
  return match && /^[a-f0-9]{64}$/.test(match) ? match : null;
}
export function newOwner() { return randomBytes(32).toString('hex'); }
export function ownerCookie(owner: string, secure: boolean) {
  return `${SESSION_COOKIE}=${owner}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=1800${secure ? '; Secure' : ''}`;
}
