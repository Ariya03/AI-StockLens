'use client';
import { useEffect, useRef, useState } from 'react';
import { EXAMPLE_STRATEGIES } from '../lib/workspace/model.ts';
import { metricDefinition, OPERATOR_LABELS } from '../lib/metrics/catalog.ts';
import type { Rule } from '../lib/screening/types.ts';
import type { IntentProposal } from '../lib/intent/proposal.ts';
export function IntentPanel({ intent, onIntent, onExample, disabled, aiEnabled=false, onApply }: {
  intent: string; onIntent: (value: string) => void; onExample: (id: string) => void; disabled: boolean;
  aiEnabled?: boolean; onApply?: (rules: readonly Rule[]) => void;
}) {
  const [proposal,setProposal]=useState<IntentProposal|null>(null);
  const [loading,setLoading]=useState(false); const [error,setError]=useState('');
  const generation=useRef(0);const controller=useRef<AbortController|null>(null);
  const original=useRef('');
  function cancel() {generation.current++;controller.current?.abort();setLoading(false);setProposal(null);setError('');}
  useEffect(()=>{cancel();return ()=>{generation.current++;controller.current?.abort();};},[intent]);
  async function parse() {
    if(loading || disabled || !intent.trim())return;
    const id=++generation.current;original.current=intent;controller.current=new AbortController();
    setLoading(true);setProposal(null);setError('');
    try {
      const response=await fetch('/api/intent',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({input:intent}),signal:controller.current.signal});
      const body=await response.json();if(id!==generation.current)return;
      if(!response.ok) {setError(body.reason ?? '解析未完成，请重试或手动配置。');return;}
      setProposal(body as IntentProposal);
    } catch {if(id===generation.current)setError('解析连接中断，请检查本机服务或手动配置。');}
    finally {if(id===generation.current)setLoading(false);}
  }
  return <section className="panel intent-panel" aria-labelledby="intent-title">
    <div className="section-heading"><div><span className="step">01 / 投资偏好</span><h2 id="intent-title">从你的研究想法开始</h2></div><span className="quiet-badge">{aiEnabled?'本机实验 AI':'程序化澄清'}</span></div>
    <label className="sr-only" htmlFor="investment-intent">投资偏好</label>
    <textarea id="investment-intent" rows={3} maxLength={2000} value={intent} disabled={disabled} onChange={e=>{cancel();onIntent(e.target.value);}} placeholder="例如：经营改善、估值合理、走势相对稳定。请尽量写明指标、比较方向和数值。" />
    <div className="intent-note"><span className="info-dot">i</span><p>{aiEnabled?'Qwen 2.5 3B 是本机实验解析器，评估结论仍为 NO-GO，不适合可靠自动解析。核验可能遗漏语义错误，必须对照原文人工审阅。仅解析输入，不读取金融数据；请勿输入凭证或私人持仓。':'公网默认使用程序化澄清：只识别三个已注册指标的明确数值条件，模糊说法会提问而不会猜测默认阈值。这不是生成式大模型，也不会自动筛选；确认后才替换编辑条件。'}</p></div>
    <div className="intent-actions"><button type="button" className="primary-button" disabled={disabled||loading||!intent.trim()} onClick={parse}>{loading? (aiEnabled?'正在解析本机模型…':'正在澄清条件…') : (aiEnabled?'AI 解析':'解析并澄清条件')}</button><button type="button" className="secondary-button" onClick={cancel}>取消提案并手动配置</button></div>
    {loading && <p role="status">{aiEnabled?'本机模型正在解析，最长等待 90 秒；不会自动执行筛选。':'正在按白名单规则澄清条件，不会调用大模型或金融数据。'}编辑原文会取消本次提案。</p>}
    {error && <p role="alert" className="request-error">{error}</p>}
    {proposal && <section className="intent-proposal" aria-label="AI 提案审阅">
      <h3>{proposal.status==='READY'?'待确认的条件提案':proposal.status==='CLARIFY'?'需要澄清':proposal.status==='UNSUPPORTED'?'暂不支持该意图':'提案未通过核验'}</h3><p>{proposal.message}</p>
      {proposal.status==='READY' && <><p>以下条件全部同时满足。未添加建议默认阈值，也未自动添加市盈率大于零。</p><ul>{proposal.rules.map((rule,i)=>{const d=metricDefinition(rule.metric);return <li key={rule.id}><strong>{d.label} {OPERATOR_LABELS[rule.operator]} {rule.value}{d.unitLabel}</strong><p>原文依据：<q>{proposal.evidence[i]}</q></p><p>{d.scopeLabel} · {d.description}</p><p className="micro-copy">{d.caveat}</p></li>;})}</ul><button type="button" className="primary-button" disabled={disabled || intent!==original.current} onClick={()=>{if(intent===original.current){onApply?.(proposal.rules);cancel();}}}>确认原文与条件一致，替换当前编辑条件</button><p className="micro-copy">替换只修改草稿；已有结果与原快照基准保持不变。请继续检查条件，再主动筛选或比较。</p></>}
      {proposal.issues.map((issue,i)=><p key={i}><q>{issue.evidence}</q>：{issue.message}</p>)}
      {proposal.status!=='READY' && <p>没有可执行的 AI 条件，当前手动条件未改变。请在上方修改原文后重试。</p>}
    </section>}
    <div className="example-grid">{EXAMPLE_STRATEGIES.map(example=><button key={example.id} type="button" className="example-card" disabled={disabled} onClick={()=>{cancel();onExample(example.id);}}>
      <span className="example-title">{example.title}<span aria-hidden="true">↗</span></span><span>{example.description}</span><strong>加载示例策略</strong>
    </button>)}</div>
    <p className="micro-copy">示例阈值是可修改的建议值。「经营改善」需要多期证据，单年净资产收益率不能证明改善。</p>
  </section>;
}
