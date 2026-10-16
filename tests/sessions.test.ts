import test from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotStore, SessionError } from '../lib/server/sessions.ts';
import { snapshot, rule } from './helpers.ts';
test('sessions are owner-bound and snapshots/rules are immutable',()=>{
  const store=new SnapshotStore(); const data=snapshot(); store.put('owner',data,[rule()]);
  assert.throws(()=>store.get('other',data.id),(e:unknown)=>e instanceof SessionError && e.status===404);
  assert.throws(()=>store.get(null,data.id),SessionError);
  const stored=store.get('owner',data.id);
  assert.ok(Object.isFrozen(stored.snapshot.stocks[0].metrics)); assert.ok(Object.isFrozen(stored.originalRules[0]));
  assert.throws(()=>{(stored.originalRules[0] as {value:number}).value=1;},TypeError);
});
test('expiry requires explicit refresh instead of silent refetch',()=>{
  let now=1000; const store=new SnapshotStore({now:()=>now,ttlMs:100}); store.put('owner',snapshot(),[rule()]); now=1100;
  assert.throws(()=>store.get('owner','test-snapshot'),(e:unknown)=>e instanceof SessionError && e.status===410);
});
test('bounded global and per-owner eviction',()=>{
  const store=new SnapshotStore({maxEntries:4});
  for(let i=0;i<5;i++) store.put('same',{...snapshot(),id:`snap-${i}`},[rule()]);
  assert.equal(store.size,3); assert.throws(()=>store.get('same','snap-0'));
  for(let i=0;i<5;i++) store.put(`owner-${i}`,{...snapshot(),id:`other-${i}`},[rule()]);
  assert.equal(store.size,4); assert.throws(()=>store.get('owner-0','other-0'));
});
test('duplicate in-flight requests are blocked and reservation released',()=>{
  const store=new SnapshotStore(); const release=store.reserve('owner'); assert.throws(()=>store.reserve('owner'),SessionError);
  release(); const next=store.reserve('owner'); next();
});
test('oversized snapshots cannot exhaust the store',()=>{
  const store=new SnapshotStore();
  const oversized={...snapshot(),universe:{name:'x'.repeat(130*1024),limited:true as const,size:1}};
  assert.throws(()=>store.put('owner',oversized,[rule()]),SessionError); assert.equal(store.size,0);
});
