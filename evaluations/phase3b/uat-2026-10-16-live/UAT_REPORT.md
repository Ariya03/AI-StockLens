# Phase 3B：真实端到端 UAT 与产品就绪审计

日期：2026-10-16，北京时间。本轮只做真实浏览器验收与审计，未修改提示词、schema、validator、模型配置或产品代码，未部署、初始化 Git 或新增支出。

**公开交付建议：BLOCKED。** 本地 PE 主链路和独立手动筛选通过，但没有公开演示 URL，既有 HTTPS 代理/公开限流等部署阻塞尚未解决，云端实际运行未验收。不是本地核心流程阻塞，也不是要求购买服务；未来只考虑零成本托管。局部本机实验可演示，但 Phase 3B 不标为完整验收通过。

## 证据类别分开统计

| 类别 | 结果 | 本轮是否执行 |
|---|---|---|
| 本地自动化测试 | 既有138/138通过 | 未重跑，不作为本轮浏览器通过率 |
| 独立真实模型回归 | 既有v4 10/16；否定、OR、股息率语义仍有失败 | 未重跑，原产物保持 |
| 实际浏览器UAT | PE主路径、手动路径和安全场景见逐项表；3项NOT VERIFIED | 本轮实际操作 |
| 扶摇接入实测 | 主路径7次、独立手动7次，总14次；HTTP200、code0 | 本轮真实网络调用 |

不计算四类合并通过率。测试模型为实际本机 qwen2.5:3b，提示词v4，配置保持原样。记录器只旁观真实响应和调用次数，不替换模型或金融响应。产品使用现有生产构建、仅监听本机3010；浏览器没有直接访问Ollama，日志不保存请求头、Cookie或环境值。

## 逐场景结果

| ID与实际输入/动作 | 期望 | 实际观察 | 结论 | 实际服务 | 证据 |
|---|---|---|---|---|---|
| E01：打开页面，输入 PE不超过20倍，点击 AI 解析 | READY；pe_ttm/lte/20；精确原文引用；不取金融数据 | 实际模型 READY，引用 PE不超过20倍；API 返回一条用户规则；调用计数 0→0 | PASS | Ollama 实际；扶摇 未调用 | [01-proposal.jpg](01-proposal.jpg)、[model-events.json](model-events.json)、[api-events.json](api-events.json) |
| E02：审阅并点击 确认原文与条件一致，替换当前编辑条件 | 确认前不替换、不自动筛选；确认后只修改草稿 | 确认前仍为四条建议草稿；确认后仅 PE TTM≤20，结果区仍空，无 screen 请求 | PASS | Ollama 实际；扶摇 未调用 | [01-proposal.jpg](01-proposal.jpg)、[api-events.json](api-events.json) |
| E03：点击 获取真实数据并筛选；展开 PE 数据依据和快照 | 用真实三股数据判断并解释 | 7 次扶摇请求均 HTTP200/code0；1入选、2排除、0未知；PE 与供应商响应逐值一致 | PASS | Ollama 实际；扶摇 实际取数 | [02-screen.jpg](02-screen.jpg)、[provider-events.json](provider-events.json)、[api-events.json](api-events.json)、[verification.json](verification.json) |
| E04：将市盈率条件阈值20改为45，点击 使用原快照比较条件 | 同快照重算，新增入选与未变解释正确；无新增扶摇请求 | 原快照及原始20倍规则保留；茅台/同花顺新增，平安银行仍入选；调用计数7→7；证据对象及数值不变 | PASS | Ollama 未调用；扶摇 复用实际数据，没有新增请求 | [03-compare.jpg](03-compare.jpg)、[api-events.json](api-events.json)、[verification.json](verification.json) |
| F01：输入 想找稳健的公司，再点击 AI 解析 | CLARIFY，无可执行 AI 规则 | CLARIFY，规则为空，人工草稿不变，无确认按钮 | PASS | Ollama 实际；扶摇 未调用 | [04-clarify.jpg](04-clarify.jpg)、[model-events.json](model-events.json)、[api-events.json](api-events.json) |
| F02：输入 PE不超过20倍，股息率至少3%，点击 AI 解析 | 不执行不支持条件；不能默默替换或部分执行 | 模型原始 CLARIFY，误将股息率映射为 PE；API REJECTED、空规则，界面无应用按钮；安全遏制PASS，正确语义解释FAIL | PASS；语义 FAIL | Ollama 实际；扶摇 未调用 | [05-dividend-rejected.jpg](05-dividend-rejected.jpg)、[model-events.json](model-events.json)、[api-events.json](api-events.json) |
| F03：输入 PE不超过20倍或ROE大于10%，点击 AI 解析 | OR不能被静默作为AND执行 | 模型原始 CLARIFY；API REJECTED、空规则；原手动草稿保留；安全遏制PASS，正确UNSUPPORTED解释FAIL | PASS；语义 FAIL | Ollama 实际；扶摇 未调用 | [06-or-rejected.jpg](06-or-rejected.jpg)、[model-events.json](model-events.json)、[api-events.json](api-events.json) |
| F04：取消提案，清空市盈率阈值 | 有限数值校验失败，阻止筛选和比较 | 中文提示阈值必须为有限数值，两个执行按钮禁用，没有新增API取数请求 | PASS | Ollama 未调用；扶摇 未调用 | [07-invalid-threshold.jpg](07-invalid-threshold.jpg)、[api-events.json](api-events.json) |
| F05：恢复建议条件，设第一条PE>30、第二条PE≤20 | 条件冲突，阻止执行 | 显示两条具体冲突规则；screen/compare按钮均禁用；无新增取数 | PASS | Ollama 未调用；扶摇 未调用 | [08-conflicting-rules.jpg](08-conflicting-rules.jpg)、[api-events.json](api-events.json) |
| E05：恢复后显式加载 只观察估值范围 示例，点击 重新获取数据并筛选 | 独立手动工作流不依赖模型，真实PE>0且≤25筛选 | 没有新增Ollama调用；明确创建新快照，另7次实际扶摇调用，2入选1排除0未知；当前值与第一份快照不同，不混入原What-if | PASS | Ollama 未调用；扶摇 实际取数 | [09-manual-screen.jpg](09-manual-screen.jpg)、[provider-events.json](provider-events.json)、[api-events.json](api-events.json) |
| F06：供应商实际缺失金融指标 | 受影响条件UNKNOWN，不补数据 | 两次真实快照均有三个指标，没有真实缺字段响应；未人为伪造数据来计作UAT | NOT VERIFIED | Ollama 未调用；扶摇 本轮正常响应，不是缺失场景 | [provider-events.json](provider-events.json)、[api-events.json](api-events.json) |
| F07：Ollama真实不可用时的错误与手动退路 | 中文模型错误，手动流程仍可用 | 模型始终可用；没有停止用户共享Ollama服务。独立手动筛选已验证，但真实模型停机错误未验证 | NOT VERIFIED | Ollama 未调用；扶摇 未调用 | [model-events.json](model-events.json)、[09-manual-screen.jpg](09-manual-screen.jpg) |
| F08：真实快照15分钟TTL到期后点击比较 | 拒绝比较并要求显式刷新，不悄悄取数 | 本轮比较在有效期内；未改变时钟/TTL或伪造过期响应，未等待本次手动快照真实到期 | NOT VERIFIED | Ollama 未调用；扶摇 未调用 | [api-events.json](api-events.json) |

E01–E04覆盖附件主路径全部13步：打开页面→原文输入→真实解析→审阅→确认→编辑器→显式筛选→真实依据→20改45→比较→计数及逐股解释核对。确认前/确认后的日志没有金融请求；仅点击筛选后才从0增加到7。

## 本次真实数据及逐股解释

主路径快照：`957d9df5-47af-43cc-97c5-1fbfda48f50e`，创建于2026-10-16T02:27:57.877Z（UTC；页面以北京时间展示）。估值实际字段 `data.item[].pe_ttm`，单位倍。下列值直接核对provider-events的第1次估值响应，不沿用此前测试数值。

| 股票 | 原始供应商PE TTM | ≤20结果 | 原快照≤45结果 | 实際解释核对 |
|---|---|---|---|---|
| 贵州茅台 600519.SH | 20.217234 | EXCLUDED | INCLUDED | 新增入选；数值超过20但不超过45 |
| 平安银行 000001.SZ | 5.161932 | INCLUDED | INCLUDED | 仍入选；数值满足20和45两种上限 |
| 同花顺 300033.SZ | 41.4026 | EXCLUDED | INCLUDED | 新增入选；数值超过20但不超过45 |

条件状态对应：平安银行PASS→PASS；贵州茅台、同花顺FAIL→PASS。页面中文解释包含实际值、20→45的阈值变化和状态变化。此次只启用PE；ROE和波动率虽实际获取并展示，但没有参与PE筛选，不能把入选解释为盈利/波动条件通过。

ROE已与供应商原始数字字符串逐值核对；波动率的61个收盘价与原始行情一致，另按60个简单日收益率、分母59独立计算复核（误差小于1e-12）。检查保存在 verification.json。其他本次快照实际值：

| 股票 | 2025年报ROE | 60日日收益率样本波动率（%） |
|---|---|---|
| 贵州茅台 | 32.53% | 1.4706325298686491 |
| 平安银行 | 9.15% | 1.059002926752867 |
| 同花顺 | 38.54% | 2.3937235827388177 |

独立手动筛选显式建立第二快照 `89e072c7-0776-4a68-b95f-d4b3739e2385`，PE>0且≤25：

- 贵州茅台：PE 20.227673，INCLUDED。
- 平安银行：PE 5.170863，INCLUDED。
- 同花顺：PE 41.573489，EXCLUDED。

新快照数值变化属于用户主动刷新后的真实数据变化，未作为前一What-if依据。

## What-if 不重新取数的独立证据

- screen金融请求计数：0→7。compare金融请求计数：**7→7，新增0**。
- screen.snapshot.id、comparison.snapshotId、comparison.before.snapshotId、comparison.after.snapshotId均相同。
- 原始规则仍为intent-1/lte/20；after为同一规则/lte/45。
- 各股before/after的全精度PE和金融evidence对象一致，逐一与原估值响应相等。新增2、移出0、仍入选1，符合数值比较。
- 上述检查结果保存于 [verification.json](verification.json)，对应真实HTTP响应在 [api-events.json](api-events.json)，上游逐次响应在 [provider-events.json](provider-events.json)。其后独立手动刷新增加7次，将本轮总计变成14；不能误说整个UAT只调用7次。

## 安全遏制与语义理解

[model-events.json](model-events.json)原样保存4次公开测试输入和原始JSON。稳健请求正确CLARIFY；股息率及OR请求的原始模型结果都是CLARIFY，而不是应有的UNSUPPORTED，分别有指标误映射/缺失报告期问题。接口没有返回具体校验码，已将真实模型日志交给原有v2校验器作只读复验，详见 model-validation.json；未调用模型或改写任何输出。应用返回REJECTED、空rules，没有允许部分应用；手动草稿不被覆盖。

因此两项安全场景可判PASS，但正确AI理解判FAIL，不能把“被拒绝”宣传成“理解了不支持的请求”。UI当前只给通用核验失败说明，具体边界说明不足。

## P0/P1/P2与最小后续动作（未实施）

- **P0 公开交付阻塞**：无已验收公开URL；当前来源校验/Secure依赖内部请求协议，既有部署审计已复现HTTPS代理风险；公开取数只有并发限制，缺频率及总预算保护。最小动作是批准后修正公开origin/Cookie、限流与预算，并在零成本Node托管中真实验收。本轮未遇到新的本地P0缺陷。
- **P0 托管状态约束**：Map只在同进程共享。免费Node服务须接受休眠/重启后明确刷新；Serverless原样运行不保证比较，若选择该路径须另行批准免费共享TTL存储。需要实际核对目标可用性、扶摇云端出站与额度/公开演示权限，不能由本机成功推定。
- **P1 已知语义缺陷**：否定边界错误来自既有10/16回归；本轮实际股息率/OR错误被拒绝。Phase3A NO-GO不变。最小可披露方案为仅本机监督实验、每个READY人工审阅，公网禁用解析；若要更广AI可用性，必须另行批准评估，不能本轮改提示词或放松校验。
- **P1 验证缺口**：真实缺字段、模型访问失败及真实TTL到期尚未完成浏览器验证。不是已经发现的产品故障。后续可在独立环境做明确标注的故障注入或等待真实TTL验收；不得作为真实供应商缺字段实测，也不得用mock结果补齐本报告。
- **P2 可披露限制**：仅三股/三个指标、固定2025年报、非年化60日样本波动率；披露日、交易日历、复权独立核验仍有限；通用REJECTED文案不解释具体错误。维持研究用途声明和数据证据入口，不扩股票池。

## 未验证范围与保护

不停止用户共享Ollama服务制造故障；不伪造缺失金融字段；不改变TTL或时钟制造过期。三项NOT VERIFIED不可引用既有单元测试代替真实UAT。本轮没有移动端/公网/云端可用性验收。

首次日志工具监听请求体造成Next请求体被提前读取，记录于相邻 `uat-2026-10-16/`，属于测试记录器故障，移除该监听后重新完成本报告流程；不是产品缺陷，也不计作产品通过。最终工具以 [instrumentation.txt](instrumentation.txt) 保存，未改变真实响应。历史证据未覆盖；核心代码和环境文件做前后哈希核对，凭证扫描无命中。临时服务在测试结束后停止。

**结论：本地PE主路径及手动筛选可用，真实数据、解释和同快照比较已贯通；公网交付仍BLOCKED，完整Phase3B不标为全量验收通过。** 等待批准修复或部署，不继续实现。
