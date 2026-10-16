'use client';
import { useRef, useState } from 'react';
import type { ScreeningResult, Snapshot } from '../lib/screening/types.ts';
import { toDraft, draftRules, draftErrors, exampleDrafts, EXAMPLE_STRATEGIES, chineseIssue, serializeStrategy, parseSavedStrategy, SAVED_STRATEGY_KEY } from '../lib/workspace/model.ts';
import type { DraftRule } from '../lib/workspace/model.ts';
import type { Comparison } from '../lib/workspace/presentation.ts';
import type { ValidationIssue } from '../lib/screening/validation.ts';
import { formatTime } from '../lib/workspace/presentation.ts';
import { IntentPanel } from './IntentPanel.tsx';
import { StrategyBuilder } from './StrategyBuilder.tsx';
import { ResultsPanel } from './ResultsPanel.tsx';
import { ComparisonPanel } from './ComparisonPanel.tsx';

type ScreenResponse = { snapshot: Snapshot; result: ScreeningResult; session: { expiresAt: string } };
class RequestFailure extends Error {}
export default function Workspace({aiEnabled=false}:{aiEnabled?:boolean}) {
  const [intent,setIntent]=useState('');
  const [drafts,setDrafts]=useState<DraftRule[]>(()=>toDraft());
  const [executed,setExecuted]=useState<ScreenResponse|null>(null);
  const [comparison,setComparison]=useState<Comparison|null>(null);
  const [busy,setBusy]=useState<'screen'|'compare'|null>(null);
  const [error,setError]=useState(''); const [notice,setNotice]=useState('');
  const [dirty,setDirty]=useState(false); const [expired,setExpired]=useState(false);
  const inFlight=useRef(false);
  const errors=draftErrors(drafts);
  function update(next:DraftRule[]) { setDrafts(next); setDirty(true); setNotice(''); setError(''); }
  function loadExample(id:string) {
    update(exampleDrafts(id)); setIntent(EXAMPLE_STRATEGIES.find(e=>e.id===id)!.intent);
    setNotice('已加载示例建议值。请确认启用条件和阈值，示例不会自动执行。');
  }
  function saveStrategy() {
    const payload=serializeStrategy(intent,drafts);
    try { localStorage.setItem(SAVED_STRATEGY_KEY,JSON.stringify(payload)); } catch { setError('浏览器未能保存策略，请尝试下载文件。'); return; }
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url; link.download='stocklens-strategy.json'; link.click();
    URL.revokeObjectURL(url);
    setNotice('已保存当前条件到本机浏览器，并下载 JSON 文件。这不是云端账号，也不会创建监控任务。');
  }
  function loadStrategy() {
    try {
      const saved=parseSavedStrategy(JSON.parse(localStorage.getItem(SAVED_STRATEGY_KEY)??'null'));
      if(!saved) { setError('没有可读取的已保存策略，或文件格式无效。'); return; }
      update(saved.drafts); setIntent(saved.intent);
      setNotice('已读取本机保存的条件，请审阅后主动筛选；未自动执行，也未恢复旧快照。');
    } catch { setError('没有可读取的已保存策略，或文件格式无效。'); }
  }
  async function run(mode:'screen'|'compare') {
    if(inFlight.current || errors.length) return;
    inFlight.current=true; setBusy(mode); setError(''); setNotice('');
    try {
      const rules=draftRules(drafts);
      const response=await fetch(`/api/${mode}`,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',
        body:JSON.stringify(mode==='screen'?{rules}:{rules,snapshotId:executed!.snapshot.id})});
      const body=await response.json();
      if(!response.ok) {
        if(body.error==='SNAPSHOT_EXPIRED' || body.error==='SNAPSHOT_UNAVAILABLE') setExpired(true);
        throw new RequestFailure(body.issues?.length?body.issues.map((i:ValidationIssue)=>chineseIssue(i)).join('；'):body.reason ?? '操作未完成，请稍后重试。');
      }
      if(mode==='screen') {
        setExecuted(body as ScreenResponse); setComparison(null); setExpired(false);
        setNotice('已获取真实数据并完成筛选。修改条件后可在同一快照上比较。');
      } else {
        setComparison(body.comparison as Comparison); setNotice('已完成同快照比较，没有重新调用金融数据接口。');
      }
      setDirty(false);
    } catch(e) { setError(e instanceof RequestFailure?e.message:'网络连接或响应异常，请检查连接后重试；此前结果仍属于原快照。'); }
    finally { setBusy(null); inFlight.current=false; }
  }
  const result=comparison?.after ?? executed?.result ?? null;
  return <div className="workspace">
    <header className="site-header"><a href="/" className="brand" aria-label="AI StockLens 首页"><span className="brand-mark" aria-hidden="true"><i/><i/><i/></span><span>AI StockLens<small>把选股依据看清楚</small></span></a><span className="header-badge"><span/>真实数据 · 可追溯筛选</span></header>
    <main>
      <div className="hero"><div><p className="eyebrow">自然语言智能选股与策略解释器</p><h1>你的标准，<span>看得见的依据。</span></h1><p className="hero-copy">把研究偏好变成明确条件，用真实金融数据检验每一个结果。</p></div><div className="universe-card"><span>当前演示股票池</span><strong>3 <small>只 A 股</small></strong><p>贵州茅台 · 平安银行 · 同花顺</p><span className="micro-copy">有限范围，不代表全市场</span></div></div>
      <IntentPanel intent={intent} onIntent={setIntent} onExample={loadExample} disabled={!!busy} aiEnabled={aiEnabled} onApply={rules=>{update(toDraft(rules));setNotice('已按你的确认替换编辑条件。请审阅后主动筛选，或使用原快照比较；未自动执行。');}}/>
      <div className="workspace-grid"><div className="builder-column">
        <StrategyBuilder drafts={drafts} onChange={update} errors={errors} disabled={!!busy} onReset={()=>{update(toDraft());setNotice('已恢复建议默认条件，请重新执行或比较。');}}/>
        <section className="action-panel" aria-label="执行筛选">
          {executed && <p className="refresh-warning">重新获取数据会创建新快照，并重置比较基准。新旧快照不能作严格的条件影响比较。</p>}
          <button type="button" className="primary-button" disabled={!!busy || errors.length>0} onClick={()=>run('screen')}>{busy==='screen'?<><span className="spinner"/>正在获取真实数据…</>:executed?'重新获取数据并筛选':'获取真实数据并筛选'}<span aria-hidden="true">↗</span></button>
          <button type="button" className="secondary-button" disabled={!!busy || !executed || expired || errors.length>0} onClick={()=>run('compare')}>{busy==='compare'?'正在比较条件…':'使用原快照比较条件'}<span aria-hidden="true">⇄</span></button>
          <button type="button" className="secondary-button" disabled={!!busy} onClick={saveStrategy}>保存当前条件<span aria-hidden="true">↓</span></button>
          <button type="button" className="secondary-button" disabled={!!busy} onClick={loadStrategy}>读取已保存条件</button>
          <p className="micro-copy">{executed?`快照有效期至 ${formatTime(executed.session.expiresAt)}（北京时间）。`:'先执行一次筛选，即可进行条件变化比较。'}</p>
          {dirty && executed && <p className="draft-notice">条件已修改。右侧仍显示上一次已执行结果，请点击比较或重新筛选。</p>}
          {expired && <p className="data-warning">快照已不可用。请重新获取数据建立新的比较基准。</p>}
          {busy && <p role="status" className="loading-note">{busy==='screen'?'正在从扶摇获取三只股票的真实数据，接口异常会明确标记。':'仅在服务端原快照上重新判断条件，不请求金融数据。'}</p>}
          {notice && <p role="status" className="success-notice">{notice}</p>}
          {error && <div role="alert" className="request-error"><strong>操作未完成</strong><p>{error}</p><span>请调整条件或稍后重试。不会生成替代金融数据。</span></div>}
        </section>
        <div className="trust-note"><span aria-hidden="true">◇</span><p>数据由扶摇提供。筛选由确定性规则执行，数据缺失会明确标记；{aiEnabled?'本机实验 AI 只提出条件，需人工审阅确认。':'程序化澄清只识别明确数值条件，需人工审阅确认。'}保存仅写入本机浏览器，不做回测或监控。</p></div>
      </div><div className="results-column"><ResultsPanel snapshot={executed?.snapshot ?? null} result={result} loading={!!busy}/><ComparisonPanel comparison={comparison}/></div></div>
      {executed && <details className="snapshot-identity"><summary>本次筛选的数据快照</summary><p>快照标识：<code>{executed.snapshot.id}</code></p><p>固定于 {formatTime(executed.snapshot.createdAt)}（北京时间），比较不刷新金融数据。</p></details>}
    </main>
    <footer><strong>研究有依据，决策需审慎。</strong><p>本产品仅用于股票筛选与研究，不构成投资建议，不提供收益承诺或买卖建议。</p><span>数据口径与完整性边界可在每项指标的数据依据中查看。</span></footer>
  </div>;
}
