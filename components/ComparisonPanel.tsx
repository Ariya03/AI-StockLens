import { STOCK_LABELS, ruleText, transitionExplanation } from '../lib/workspace/presentation.ts';
import type { Comparison } from '../lib/workspace/presentation.ts';

export function ComparisonPanel({comparison}: {comparison: Comparison | null}) {
  if(!comparison) return null;
  const same=comparison.before.stocks.filter(before=>comparison.after.stocks.find(s=>s.code===before.code)?.status===before.status);
  return <section className="panel comparison-panel" aria-labelledby="comparison-title">
    <div className="section-heading"><div><span className="step">04 / 条件变化影响</span><h2 id="comparison-title">同一份数据，看看标准改变了什么</h2></div><span className="quiet-badge">没有重新获取数据</span></div>
    <p className="comparison-context">比较始终相对于本次获取数据后的原始策略。数据快照保持不变。</p>
    <div className="comparison-stats"><div><strong>{comparison.newlyIncluded.length}</strong><span>新增入选</span></div><div><strong>{comparison.noLongerIncluded.length}</strong><span>移出入选</span></div><div><strong>{same.length}</strong><span>状态未变</span></div></div>
    <details className="changed-rules" open><summary>修改了哪些条件</summary>{comparison.changedRuleIds.length?comparison.changedRuleIds.map(id=>{
      const before=comparison.before.rules.find(r=>r.id===id),after=comparison.after.rules.find(r=>r.id===id);
      return <div className="changed-rule" key={id}><span>{before?ruleText(before):'原策略未启用'}</span><span aria-hidden="true">→</span><strong>{after?ruleText(after):'已停用此条件'}</strong></div>;
    }):<p>启用条件与原始策略相同，结果未发生变化。</p>}</details>
    <div className="comparison-rows">{comparison.after.stocks.map(after=>{
      const before=comparison.before.stocks.find(s=>s.code===after.code)!;
      const tag=comparison.newlyIncluded.includes(after.code)?'新增入选':comparison.noLongerIncluded.includes(after.code)?'移出入选':before.status===after.status?'状态未变':'判断状态变化';
      return <article key={after.code}><div className="comparison-row-heading"><strong>{after.name}</strong><span className={`change-tag ${tag==='新增入选'?'change-positive':''}`}>{tag}</span></div><p className="comparison-transition">{STOCK_LABELS[before.status]} <span aria-hidden="true">→</span> {STOCK_LABELS[after.status]}</p><p>{transitionExplanation(before,after)}</p></article>;
    })}</div>
    {comparison.unknownTransitions.length>0 && <p className="data-warning">有 {comparison.unknownTransitions.length} 只股票涉及无法判断状态的变化，请结合数据问题理解结果。</p>}
  </section>;
}
