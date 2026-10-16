import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { snapshot, metric } from '../helpers.ts';
import { screen, compareRules } from '../../lib/screening/engine.ts';
import { DEFAULT_RULES } from '../../lib/screening/defaults.ts';
import type { Rule } from '../../lib/screening/types.ts';

// Isolated DOM and synthetic inputs for component tests only; never used by the app.
const dom=new JSDOM('<!doctype html><html lang="zh-CN"><body></body></html>',{url:'http://localhost'});
for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,IS_REACT_ACT_ENVIRONMENT:true})) Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
const {render,fireEvent,cleanup,waitFor}=await import('@testing-library/react');
const {default:Workspace}=await import('../../components/Workspace.tsx');
const {ResultsPanel}=await import('../../components/ResultsPanel.tsx');
const {ComparisonPanel}=await import('../../components/ComparisonPanel.tsx');
const originalFetch=globalThis.fetch;
Object.defineProperty(globalThis.URL,'createObjectURL',{value:()=>'blob:stocklens-test',configurable:true});
Object.defineProperty(globalThis.URL,'revokeObjectURL',{value:()=>{},configurable:true});
afterEach(()=>{cleanup();globalThis.fetch=originalFetch;dom.window.localStorage.clear();});

test('initial workspace is Chinese, limited-scope and honest about AI',()=>{
  const ui=render(<Workspace/>);
  assert.ok(ui.getByText('程序化澄清'));assert.ok(ui.getByText(/不是生成式大模型/));
  assert.ok(ui.getByText(/不构成投资建议/));assert.ok(ui.getByText('有限范围，不代表全市场'));
  assert.ok((ui.getByRole('button',{name:/使用原快照比较条件/}) as HTMLButtonElement).disabled);
  fireEvent.change(ui.getByLabelText('投资偏好'),{target:{value:'PE 不超过 10 倍，稳赚'}});
  assert.equal((ui.getByRole('spinbutton',{name:'市盈率条件 2 阈值'}) as HTMLInputElement).value,'25');
  assert.ok(ui.getByText(/你的第一份筛选结果/));
});
test('example loading is explicit; edits mark user values and disabling is supported',()=>{
  const ui=render(<Workspace/>);
  fireEvent.click(ui.getByRole('button',{name:/只观察估值范围/}));
  assert.ok(!(ui.getByRole('checkbox',{name:'启用年报净资产收益率条件 1'}) as HTMLInputElement).checked);
  assert.ok(ui.getByText(/已加载示例建议值/));
  fireEvent.change(ui.getByRole('spinbutton',{name:'市盈率条件 2 阈值'}),{target:{value:'20'}});
  assert.ok(ui.getAllByText('用户设置').length>0);
  assert.equal((ui.getByRole('spinbutton',{name:'市盈率条件 2 阈值'}) as HTMLInputElement).value,'20');
});
test('contradictory conditions show Chinese error and block execution',()=>{
  const ui=render(<Workspace/>);
  fireEvent.change(ui.getByRole('spinbutton',{name:'市盈率条件 1 阈值'}),{target:{value:'30'}});
  fireEvent.change(ui.getByRole('spinbutton',{name:'市盈率条件 2 阈值'}),{target:{value:'10'}});
  assert.ok(ui.getByRole('alert').textContent?.includes('条件冲突'));
  assert.ok((ui.getByRole('button',{name:/获取真实数据并筛选/}) as HTMLButtonElement).disabled);
});
test('saving and loading conditions stays on the device and does not screen',()=>{
  const ui=render(<Workspace/>);
  fireEvent.change(ui.getByRole('spinbutton',{name:'市盈率条件 2 阈值'}),{target:{value:'18'}});
  fireEvent.click(ui.getByRole('button',{name:/保存当前条件/}));
  assert.ok(ui.getByText(/已保存当前条件到本机浏览器/));
  fireEvent.click(ui.getByRole('button',{name:/恢复建议条件/}));
  assert.equal((ui.getByRole('spinbutton',{name:'市盈率条件 2 阈值'}) as HTMLInputElement).value,'25');
  fireEvent.click(ui.getByRole('button',{name:/读取已保存条件/}));
  assert.equal((ui.getByRole('spinbutton',{name:'市盈率条件 2 阈值'}) as HTMLInputElement).value,'18');
  assert.equal(ui.queryByRole('heading',{name:/已入选/}),null);
});
test('empty threshold is not silently converted to zero',()=>{
  const ui=render(<Workspace/>);
  fireEvent.change(ui.getByRole('spinbutton',{name:'市盈率条件 2 阈值'}),{target:{value:''}});
  assert.ok(ui.getByRole('alert').textContent?.includes('有限数值'));
});
test('builder adds metadata-defined conditions without new UI structure',()=>{
  const ui=render(<Workspace/>);
  fireEvent.click(ui.getAllByRole('button',{name:/添加条件/})[1]);
  assert.equal(ui.getAllByRole('spinbutton').length,5);
  assert.ok(ui.getByRole('combobox',{name:'年报净资产收益率条件 2 运算符'}));
});
test('execute, modify, compare: browser sends ID/rules only and baseline is preserved',async()=>{
  const data=snapshot(30);let originalRules:readonly Rule[]=DEFAULT_RULES;const urls:string[]=[];
  globalThis.fetch=(async(input,options)=>{
    urls.push(String(input));const body=JSON.parse(String(options?.body));
    if(String(input)==='/api/screen') {
      originalRules=body.rules;
      return Response.json({snapshot:data,result:screen(data,originalRules),session:{expiresAt:'2026-10-15T23:00:00Z'}});
    }
    assert.equal(body.snapshotId,data.id);assert.deepEqual(Object.keys(body).sort(),['rules','snapshotId']);
    return Response.json({comparison:compareRules(data,originalRules,body.rules),session:{expiresAt:'2026-10-15T23:00:00Z'}});
  }) as typeof fetch;
  const ui=render(<Workspace/>);fireEvent.click(ui.getByRole('button',{name:/只观察估值范围/}));
  fireEvent.click(ui.getByRole('button',{name:/获取真实数据并筛选/}));
  await waitFor(()=>assert.ok(ui.getByText(/已获取真实数据并完成筛选/)));
  fireEvent.change(ui.getByRole('spinbutton',{name:'市盈率条件 2 阈值'}),{target:{value:'45'}});
  assert.ok(ui.getByText(/右侧仍显示上一次已执行结果/));
  fireEvent.click(ui.getByRole('button',{name:/使用原快照比较条件/}));
  await waitFor(()=>assert.ok(ui.getByText(/已完成同快照比较/)));
  assert.deepEqual(urls,['/api/screen','/api/compare']);assert.ok(ui.getByRole('heading',{name:/同一份数据/}));
  assert.ok(ui.getByText('没有重新获取数据'));
});
test('loading prevents duplicate execution and survives a request failure',async()=>{
  let resolve!:(response:Response)=>void;let calls=0;
  globalThis.fetch=(()=>{calls++;return new Promise<Response>(r=>{resolve=r;});}) as typeof fetch;
  const ui=render(<Workspace/>);fireEvent.click(ui.getByRole('button',{name:/获取真实数据并筛选/}));
  assert.ok(ui.getAllByText(/正在获取真实金融数据/).length>0);
  assert.ok((ui.getByRole('button',{name:/正在获取真实数据/}) as HTMLButtonElement).disabled);
  resolve(Response.json({reason:'筛选服务暂不可用，请稍后重试。'},{status:503}));
  await waitFor(()=>assert.ok(ui.getByRole('alert').textContent?.includes('暂不可用')));
  assert.equal(calls,1);assert.ok(ui.getByText(/不会生成替代金融数据/));
});
test('expired comparison keeps prior results and asks for explicit refresh',async()=>{
  const data=snapshot(20);
  globalThis.fetch=(async(input)=>String(input)==='/api/screen'?Response.json({snapshot:data,result:screen(data,DEFAULT_RULES),session:{expiresAt:'2026-10-15T23:00:00Z'}}):Response.json({error:'SNAPSHOT_EXPIRED',reason:'快照已过期，请重新获取数据。'},{status:410})) as typeof fetch;
  const ui=render(<Workspace/>);fireEvent.click(ui.getByRole('button',{name:/获取真实数据并筛选/}));
  await waitFor(()=>assert.ok(ui.getByText(/已获取真实数据并完成筛选/)));
  fireEvent.click(ui.getByRole('button',{name:/使用原快照比较条件/}));
  await waitFor(()=>assert.ok(ui.getByRole('alert').textContent?.includes('快照已过期')));
  assert.ok((ui.getByRole('button',{name:/使用原快照比较条件/}) as HTMLButtonElement).disabled);
  assert.ok(ui.getByText('快照已不可用。请重新获取数据建立新的比较基准。'));
});
test('missing values and provider errors have visible evidence, not fake numbers',()=>{
  const base=snapshot();const data={...base,stocks:base.stocks.map(s=>({...s,metrics:{...s.metrics,pe_ttm:metric(null,{issue:{code:'TIMEOUT',reason:'金融数据请求超时'}})}}))};
  const ui=render(<ResultsPanel snapshot={data} result={screen(data,DEFAULT_RULES)} loading={false}/>);
  assert.ok(ui.getByText('部分数据不可用'));assert.ok(ui.getAllByText('金融数据请求超时').length>0);
  assert.ok(ui.getAllByText('暂无可用数据').length>0);assert.ok(ui.getAllByText('无法判断').length>0);
  assert.ok(ui.getAllByText('供应商时间').length>0);assert.ok(ui.getAllByText('原始字段').length>0);
});
test('comparison explains unchanged exclusions instead of claiming every relaxation adds a stock',()=>{
  const data=snapshot(50);const before=DEFAULT_RULES.filter(r=>r.metric==='pe_ttm');
  const comparison=compareRules(data,before,before.map(r=>r.id==='pe-max'?{...r,value:45}:r));
  const ui=render(<ComparisonPanel comparison={comparison}/>);
  assert.ok(ui.getAllByText('状态未变').length>0);assert.ok(ui.getByText(/仍然排除/));
});

const aiProposal={status:'READY',rules:[{id:'intent-1',metric:'pe_ttm',operator:'lte',value:20,unit:'times',origin:'user'}],evidence:['PE不超过20倍'],issues:[],message:'请确认后应用。'};
test('AI READY requires review and explicit confirmation before replacing manual draft; no automatic screening',async()=>{
  const calls:string[]=[];globalThis.fetch=(async(url)=>{calls.push(String(url));return Response.json(aiProposal);}) as typeof fetch;
  const ui=render(<Workspace aiEnabled/>);fireEvent.change(ui.getByLabelText('投资偏好'),{target:{value:'PE不超过20倍'}});fireEvent.click(ui.getByRole('button',{name:'AI 解析'}));
  await waitFor(()=>assert.ok(ui.getByRole('heading',{name:'待确认的条件提案'})));
  assert.equal((ui.getByRole('spinbutton',{name:'市盈率条件 2 阈值'}) as HTMLInputElement).value,'25');assert.ok(ui.getAllByText('PE不超过20倍').length>0);
  fireEvent.click(ui.getByRole('button',{name:/确认原文与条件一致/}));assert.equal(ui.getAllByRole('spinbutton').length,1);assert.equal((ui.getByRole('spinbutton') as HTMLInputElement).value,'20');assert.deepEqual(calls,['/api/intent']);
});
test('AI clarify unsupported and rejected output leave manual strategy unchanged and cannot confirm',async()=>{
  for(const status of ['CLARIFY','UNSUPPORTED','REJECTED']){
    globalThis.fetch=(async()=>Response.json({...aiProposal,status,rules:[],evidence:[],message:'无法执行。'})) as typeof fetch;
    const ui=render(<Workspace aiEnabled/>);fireEvent.change(ui.getByLabelText('投资偏好'),{target:{value:'稳健'}});fireEvent.click(ui.getByRole('button',{name:'AI 解析'}));await waitFor(()=>assert.ok(ui.getByText('无法执行。')));
    assert.equal(ui.queryByRole('button',{name:/确认原文与条件一致/}),null);assert.equal(ui.getAllByRole('spinbutton').length,4);cleanup();
  }
});
test('editing text invalidates proposal and cancelling preserves manual rules',async()=>{
  globalThis.fetch=(async()=>Response.json(aiProposal)) as typeof fetch;
  const ui=render(<Workspace aiEnabled/>);fireEvent.change(ui.getByLabelText('投资偏好'),{target:{value:'PE不超过20倍'}});fireEvent.click(ui.getByRole('button',{name:'AI 解析'}));await waitFor(()=>assert.ok(ui.getByRole('heading',{name:'待确认的条件提案'})));
  fireEvent.change(ui.getByLabelText('投资偏好'),{target:{value:'PE不超过30倍'}});assert.equal(ui.queryByRole('button',{name:/确认原文与条件一致/}),null);
  fireEvent.click(ui.getByRole('button',{name:'AI 解析'}));await waitFor(()=>assert.ok(ui.getByRole('heading',{name:'待确认的条件提案'})));
  fireEvent.click(ui.getByRole('button',{name:'取消提案并手动配置'}));assert.equal(ui.queryByRole('heading',{name:'待确认的条件提案'}),null);assert.equal(ui.getAllByRole('spinbutton').length,4);
});
test('stale in-flight model output is discarded after editing even if transport ignores cancellation',async()=>{
  let done!:(r:Response)=>void;globalThis.fetch=(()=>new Promise(r=>{done=r;})) as typeof fetch;
  const ui=render(<Workspace aiEnabled/>);fireEvent.change(ui.getByLabelText('投资偏好'),{target:{value:'PE不超过20倍'}});fireEvent.click(ui.getByRole('button',{name:'AI 解析'}));fireEvent.change(ui.getByLabelText('投资偏好'),{target:{value:'PE不超过40倍'}});done(Response.json(aiProposal));
  await new Promise(r=>setTimeout(r,20));assert.equal(ui.queryByRole('heading',{name:'待确认的条件提案'}),null);assert.equal(ui.getAllByRole('spinbutton').length,4);
});
test('AI unavailable preserves manual fallback',async()=>{
  globalThis.fetch=(async()=>Response.json({reason:'本机模型离线，请手动配置。'},{status:503})) as typeof fetch;
  const ui=render(<Workspace aiEnabled/>);fireEvent.change(ui.getByLabelText('投资偏好'),{target:{value:'PE不超过20倍'}});fireEvent.click(ui.getByRole('button',{name:'AI 解析'}));await waitFor(()=>assert.ok(ui.getByRole('alert').textContent?.includes('离线')));assert.equal(ui.getAllByRole('spinbutton').length,4);
});
test('AI-assisted what-if keeps original snapshot and baseline and only sends conditions to intent',async()=>{
  const data=snapshot(30);let baseline:readonly Rule[]=[];let screenCalls=0;
  globalThis.fetch=(async(url,options)=>{
    const body=JSON.parse(String(options?.body));
    if(String(url)==='/api/intent'){assert.deepEqual(Object.keys(body),['input']);return Response.json({...aiProposal,rules:aiProposal.rules.map(r=>({...r,value:45})),evidence:['PE不超过45倍']});}
    if(String(url)==='/api/screen'){screenCalls++;baseline=body.rules;return Response.json({snapshot:data,result:screen(data,baseline),session:{expiresAt:'2026-10-15T23:00:00Z'}});}
    assert.equal(body.snapshotId,data.id);assert.equal(baseline.find(r=>r.id==='pe-max')!.value,25);return Response.json({comparison:compareRules(data,baseline,body.rules)});
  }) as typeof fetch;
  const ui=render(<Workspace aiEnabled/>);fireEvent.click(ui.getByRole('button',{name:/只观察估值范围/}));fireEvent.click(ui.getByRole('button',{name:/获取真实数据并筛选/}));await waitFor(()=>assert.ok(ui.getByText(/已获取真实数据并完成筛选/)));
  fireEvent.change(ui.getByLabelText('投资偏好'),{target:{value:'PE不超过45倍'}});fireEvent.click(ui.getByRole('button',{name:'AI 解析'}));await waitFor(()=>assert.ok(ui.getByRole('heading',{name:'待确认的条件提案'})));fireEvent.click(ui.getByRole('button',{name:/确认原文与条件一致/}));fireEvent.click(ui.getByRole('button',{name:/使用原快照比较条件/}));await waitFor(()=>assert.ok(ui.getByText(/已完成同快照比较/)));assert.equal(screenCalls,1);
});
