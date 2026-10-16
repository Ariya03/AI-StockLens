'use client';
import { METRIC_DEFINITIONS, OPERATOR_LABELS } from '../lib/metrics/catalog.ts';
import type { DraftRule } from '../lib/workspace/model.ts';
import type { Operator } from '../lib/screening/types.ts';

export function StrategyBuilder({ drafts, onChange, errors, disabled, onReset }: {
  drafts: readonly DraftRule[]; onChange: (drafts: DraftRule[]) => void; errors: readonly string[]; disabled: boolean; onReset: () => void;
}) {
  const update=(id:string,patch:Partial<DraftRule>)=>onChange(drafts.map(r=>r.id===id?{...r,...patch,origin:'user'}:{...r}));
  return <section className="panel strategy-panel" aria-labelledby="strategy-title">
    <div className="section-heading"><div><span className="step">02 / 可执行条件</span><h2 id="strategy-title">把标准写清楚</h2></div><button className="text-button" type="button" onClick={onReset} disabled={disabled}>恢复建议条件</button></div>
    <div className="logic-note"><span className="logic-tag">且</span><span>股票需同时满足所有启用条件</span><span className="condition-count">{drafts.filter(r=>r.enabled).length} 项已启用</span></div>
    <div className="metric-builder-list">{METRIC_DEFINITIONS.map((metric,index)=>{
      const rows=drafts.filter(r=>r.metric===metric.id);
      return <article key={metric.id} className="metric-builder">
        <div className="metric-heading"><span className="metric-index">{String(index+1).padStart(2,'0')}</span><div><h3>{metric.label}</h3><p>{metric.scopeLabel}</p></div></div>
        <div className="rule-inputs">{rows.map((row,i)=><div className={`rule-input-row ${row.enabled?'':'is-disabled'}`} key={row.id}>
          <label className="condition-toggle"><input type="checkbox" checked={row.enabled} disabled={disabled} onChange={e=>update(row.id,{enabled:e.target.checked})}/><span className="sr-only">启用{metric.shortLabel}条件 {i+1}</span></label>
          <label><span className="sr-only">{metric.shortLabel}条件 {i+1} 运算符</span><select value={row.operator} disabled={disabled || !row.enabled} onChange={e=>update(row.id,{operator:e.target.value as Operator})}>{metric.operators.map(op=><option value={op} key={op}>{OPERATOR_LABELS[op]}</option>)}</select></label>
          <label className="threshold-input"><span className="sr-only">{metric.shortLabel}条件 {i+1} 阈值</span><input aria-label={`${metric.shortLabel}条件 ${i+1} 阈值`} type="number" inputMode="decimal" value={row.value} min={metric.constraints.min} step={metric.constraints.step} disabled={disabled || !row.enabled} onChange={e=>update(row.id,{value:e.target.value})}/><span aria-hidden="true">{metric.unitLabel}</span></label>
          <span className={`origin-label ${row.origin==='user'?'user-origin':''}`}>{row.origin==='user'?'用户设置':'建议默认'}</span>
          {rows.length>1 && <button className="delete-rule" type="button" disabled={disabled} aria-label={`移除${metric.shortLabel}条件 ${i+1}`} onClick={()=>onChange(drafts.filter(r=>r.id!==row.id))}>×</button>}
        </div>)}</div>
        <div className="metric-help"><details><summary>指标定义与边界</summary><p>{metric.description}</p><p>{metric.caveat}</p></details><button type="button" className="text-button add-rule" disabled={disabled || drafts.length>=20} onClick={()=>onChange([...drafts,{id:`${metric.id}-${crypto.randomUUID()}`,metric:metric.id,operator:metric.operators[0],value:String(metric.constraints.min ?? 0),origin:'user',enabled:true}])}>＋ 添加条件</button></div>
      </article>;
    })}</div>
    {errors.length>0 && <div className="validation-errors" role="alert"><strong>请先调整条件</strong><ul>{errors.map((error,i)=><li key={i}>{error}</li>)}</ul></div>}
  </section>;
}
