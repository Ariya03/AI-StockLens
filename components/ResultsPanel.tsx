import type { MetricData, RuleResult, ScreeningResult, Snapshot, StockData, StockResult, StockStatus } from '../lib/screening/types.ts';
import { METRIC_DEFINITIONS, metricDefinition, OPERATOR_SYMBOLS } from '../lib/metrics/catalog.ts';
import { formatValue, formatTime, STOCK_LABELS, RULE_LABELS, issueText, stockExplanation } from '../lib/workspace/presentation.ts';

export function StatusBadge({status}: {status: RuleResult['status'] | StockStatus}) {
  const label=status in STOCK_LABELS ? STOCK_LABELS[status as StockStatus] : RULE_LABELS[status as RuleResult['status']];
  return <span className={`status-badge status-${status.toLowerCase()}`}><span aria-hidden="true"/>{label}</span>;
}
export function EvidenceDetails({data, label}: {data: MetricData; label: string}) {
  const p=data.provenance;
  return <details className="evidence-details"><summary>{label}的数据依据</summary><dl>
    <div><dt>数据来源</dt><dd>{p.provider}金融数据</dd></div>
    <div><dt>统计口径</dt><dd>{p.definition.replaceAll('index_weighted_avg_roe','净资产收益率字段')}</dd></div>
    <div><dt>报告期或窗口</dt><dd>{p.reportPeriod==='2025-4'?'2025 年报':p.windowStart?`${p.windowStart} 至 ${p.windowEnd} · 前复权`:'最新估值快照'}</dd></div>
    <div><dt>供应商时间</dt><dd>{formatTime(p.providerTimestamp)}{!p.providerTimestamp?'（不代表数据为零）':''}</dd></div>
    <div><dt>获取时间（北京时间）</dt><dd>{formatTime(p.retrievedAt)}</dd></div>
    {p.reportPeriod && <div><dt>财报披露日期</dt><dd>未核实，不用于历史时点回测</dd></div>}
    <div><dt>供应商原始值</dt><dd>{data.rawValue===null?(data.derivedInputs?'派生计算，见下方计算输入':'未提供'):String(data.rawValue)}</dd></div>
    <div><dt>原始字段</dt><dd><code>{p.sourceField}</code></dd></div>
    <div><dt>请求追踪标识</dt><dd><code>{p.requestId ?? '未提供'}</code></dd></div>
    {data.issue && <div><dt>数据问题</dt><dd className="issue-text">{issueText(data)}</dd></div>}
  </dl>{data.derivedInputs && <details className="calculation-inputs"><summary>查看计算使用的 {data.derivedInputs.closes.length} 个收盘价</summary><p className="micro-copy">单位：元；前复权价格；全精度数据用于计算。</p><div className="price-input-scroll"><table><thead><tr><th>日期</th><th>收盘价</th></tr></thead><tbody>{data.derivedInputs.dates.map((date,i)=><tr key={date}><td>{date}</td><td>{data.derivedInputs!.closes[i]}</td></tr>)}</tbody></table></div></details>}</details>;
}
export function StockCard({stock,data}: {stock: StockResult; data: StockData}) {
  return <article className={`stock-card stock-${stock.status.toLowerCase()}`}>
    <div className="stock-heading"><div><h4>{stock.name}</h4><span className="stock-code">{stock.code}</span></div><StatusBadge status={stock.status}/></div>
    <p className="stock-reason">{stockExplanation(stock)}</p>
    <div className="stock-metrics">{METRIC_DEFINITIONS.map(metric=>{
      const evidence=data.metrics[metric.id];
      const rules=stock.rules.filter(r=>r.rule.metric===metric.id);
      return <div className="stock-metric" key={metric.id}>
        <div className="metric-value-heading"><span>{metric.shortLabel}</span><strong>{evidence.issue?'暂无可用数据':formatValue(evidence.value,metric.unitLabel)}</strong></div>
        {rules.length?rules.map(r=><div key={r.rule.id} className="result-rule"><span>{OPERATOR_SYMBOLS[r.rule.operator]} {r.rule.value}{metric.unitLabel}</span><StatusBadge status={r.status}/></div>):<span className="inactive-rule">未启用此条件 · 不参与筛选</span>}
        {evidence.issue && <p className="issue-text">{issueText(evidence)}</p>}
        <EvidenceDetails data={evidence} label={metric.shortLabel}/>
      </div>;
    })}</div>
  </article>;
}
export function ResultsPanel({snapshot,result,loading}: {snapshot:Snapshot|null;result:ScreeningResult|null;loading:boolean}) {
  const groups: StockStatus[]=['INCLUDED','EXCLUDED','UNKNOWN'];
  if(!snapshot || !result) return <section className="panel results-panel" aria-labelledby="results-title"><div className="section-heading"><div><span className="step">03 / 筛选与依据</span><h2 id="results-title">让每一个结果有据可查</h2></div></div><div className="empty-results"><span className="empty-symbol" aria-hidden="true">⌕</span><h3>{loading?'正在获取真实金融数据':'你的第一份筛选结果，从这里开始'}</h3><p>{loading?'正在查询市盈率、2025 年报和前复权历史日线，请稍候。':'确认左侧条件后，点击「获取真实数据并筛选」。'}</p><div className="universe-pills"><span>贵州茅台</span><span>平安银行</span><span>同花顺</span></div><p className="micro-copy">仅包含以上 3 只 A 股，不代表全市场。</p></div></section>;
  const issues=snapshot.stocks.flatMap(s=>Object.values(s.metrics)).filter(m=>m.issue);
  return <section className="results-panel" aria-labelledby="results-title" aria-busy={loading}>
    <div className="section-heading"><div><span className="step">03 / 筛选与依据</span><h2 id="results-title">结果不是黑箱</h2></div><span className="quiet-badge">{snapshot.universe.size} 只演示股票</span></div>
    <div className="results-summary">{groups.map(status=><div className={`count-card count-${status.toLowerCase()}`} key={status}><span>{STOCK_LABELS[status]}</span><strong>{result.counts[status]}<small>只</small></strong></div>)}</div>
    <div className="snapshot-caption"><span>快照日期 {snapshot.asOf}</span><span>获取于 {formatTime(snapshot.createdAt)}（北京时间）</span></div>
    {issues.length>0 && <div className="data-warning" role="status"><strong>部分数据不可用</strong><p>{issues.length} 项指标存在缺失、过期或接口问题。无法判断不会被当作零；即使股票已排除，其他条件仍可能缺少数据。可展开下方依据查看原因。</p></div>}
    {groups.map(status=>{
      const stocks=result.stocks.filter(s=>s.status===status);
      return <div className="result-group" key={status}><h3>{STOCK_LABELS[status]}<span>{stocks.length}</span></h3>{stocks.length?stocks.map(stock=><StockCard key={stock.code} stock={stock} data={snapshot.stocks.find(s=>s.code===stock.code)!}/>):<p className="empty-group">{status==='INCLUDED'?'暂无股票满足全部启用条件。':status==='EXCLUDED'?'暂无因条件不满足而排除的股票。':'当前没有无法判断的股票。'}</p>}</div>;
    })}
    <p className="micro-copy results-footnote">数值展示最多保留四位小数，筛选使用全精度。估值批量时间不代表每项指标同步更新；年报披露日期未核实。历史数据尚未独立核对交易日历完整性。</p>
  </section>;
}
