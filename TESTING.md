# 测试说明与验收边界

整理日期：2026-10-16。以下严格区分当前代码复验、历史阶段通过、真实接口/模型与浏览器证据。历史结果不等于当前版本验收，也不等于公网成功。

## 仓库整理阶段的本地复验

以下保留 2026-10-16 仓库整理时的结果，不是路由修复后的全量重跑，也不是 Vercel 公网验收。文中的「本次/本轮」指该次整理复验。

使用本机 Node.js 24.19.0 和现有依赖，未安装新依赖、修改业务代码或测试。

整理时记录了文件哈希核对、文档链接检查及凭证扫描，生产构建自动刷新了 `next-env.d.ts` 的生成类型引用。但原始哈希清单与扫描报告未随仓库保存，因此此处不列扫描数量或命中数，也不将该记录作为可独立复核的安全证明；已上传文件及 Git 历史仍需单独检查。

**证据限制：** 下表的单元/组件计数来自当时本机临时日志，未纳入仓库；类型检查与构建结果来自开发执行记录，未附完整日志。数字按历史观察保留，GitHub 评审无法仅凭当前仓库独立核验这些计数与执行结果，不能据此宣称当前版本全量通过。下文命令可用于重新验证，但新结果只代表重跑时的版本与环境。

| 检查 | 本次结果 |
|---|---|
| `npm test` | **失败**；先执行单元测试，136 项中 135 通过、1 失败、0 跳过。因命令使用 `&&`，没有继续组件测试。 |
| `npm run test:components`（另行执行） | **失败**；17 项中 16 通过、1 失败、0 跳过。 |
| `npm run typecheck` | 通过。 |
| `npm run build` | 通过；Next.js 生产构建包含首页、错误/未找到页、图标及 health / intent / screen / compare API。 |

两个失败均保留，不以更新断言掩盖：

1. [公网模式测试](tests/deployment-security.test.ts)的 public mode 用例期望 503，当时实际观察为 403。当前公网关闭的是本机模型，intent 路径改为程序化澄清；该测试请求缺少 Origin，先触发来源拒绝。旧行为断言与新增模式不一致，仍需获准核实并补齐正确安全测试，不应删除来源保护。代码可审阅，但当次失败输出尚无仓库内原始日志。
2. [本机保存/读取组件测试](tests/components/workspace.test.tsx)当时找不到「已保存当前条件到本机浏览器」提示。测试只安装 `window` 等全局而未安装裸 `localStorage`；[实现](components/Workspace.tsx)直接使用 `localStorage`，在该环境进入保存失败分支。这是现有代码/测试环境对照的初步解释，尚未完成真实浏览器保存复验；不能据此宣称用户功能已通过。

本轮没有修复这两项，符合只整理仓库、不改业务逻辑的范围。当前不能写「所有测试通过」或直接引用旧 138/138。

## 可复现命令

先按 README 配置并启动环境。自动化测试不要求真实密钥或 Ollama：

```sh
npm test
npm run test:unit
npm run test:components
npm run typecheck
npm run build
```

真实扶摇验证需要有效 `.env.local`，会实际消耗供应商调用额度；不是离线测试：

```sh
npm run test:live
npm run test:phase2:live
```

独立真实模型回归需要已运行的本机 Ollama 与 `qwen2.5:3b`：

```sh
npm run test:ollama
```

该命令实际访问本机模型，保存新时间目录；模型不可用或用例失败会非零退出，不静默跳过。当前历史结果 10/16，不能预期命令必然成功。普通单元/组件中的 mock 不替代它。旧 `scripts/evaluate-intent.ts` 用于历史阶段评估；复跑前检查输出路径，避免覆盖 v1/v2 存档。

可选本机浏览器模型实验（不要在公网启用）：

```sh
STOCKLENS_LOCAL_AI=1 npm run dev -- --hostname 127.0.0.1
```

本次只执行了离线自动化、类型检查和构建，**未重新取金融数据、调用模型、操作浏览器或验证公网**。

## 历史测试与验证证据

证据分层：阶段报告可追溯当时的记录与结论，但不等于原始执行日志；模型与最终真实 UAT 另有仓库内原始输出和核验文件。历史自动化计数不作为当前版本全量通过的依据。

| 类别 | 有记录的结果 | 证据与限制 |
|---|---|---|
| Phase 1 自动化 | 报告记载 79/79。 | [Phase 1](docs/PHASE1_VALIDATION.md)，是当时版本；未附该次完整原始测试日志。 |
| Phase 2 自动化及会话接口 | 报告记载 109/109；真实快照 7 次调用成功，两次比较新增上游 0。 | [Phase 2](docs/PHASE2_VALIDATION.md)，报告级记录，未附该次完整原始执行日志；不能证明后来新增功能或公网跨进程存储。 |
| Phase 3B 自动化 | 报告记载 138/138。 | [提示词回归报告](docs/PHASE3B_PROMPT_REGRESSION.md)，未附该次完整原始测试日志；不是本次测试结果。 |
| Phase 3A 真实模型 | v1 6/30；v2 16/30；NO-GO。 | [模型评估](docs/PHASE3A_EVALUATION.md)、[v1 汇总](evaluations/intent/v1/summary.json) / [逐条输出](evaluations/intent/v1/results.jsonl)、[v2 汇总](evaluations/intent/v2/summary.json) / [逐条输出](evaluations/intent/v2/results.jsonl)；不是 mock。 |
| Phase 3B 真实模型回归 | v4 10/16，两个原始 PE 输入重复通过。 | [回归报告](docs/PHASE3B_PROMPT_REGRESSION.md)、[实际汇总](evaluations/phase3b/regression-2026-10-16T02-02-03-460Z/summary.json)、[逐条结果](evaluations/phase3b/regression-2026-10-16T02-02-03-460Z/results.json)、[运行元数据](evaluations/phase3b/regression-2026-10-16T02-02-03-460Z/metadata.json)；其他语义仍失败。 |
| Phase 3B 真实浏览器 / 扶摇 | PE 提案与确认、数据依据、同快照比较、独立手动筛选通过；总 14 次上游调用 HTTP200/code0。 | [最终 UAT](evaluations/phase3b/uat-2026-10-16-live/UAT_REPORT.md)、[供应商响应](evaluations/phase3b/uat-2026-10-16-live/provider-events.json)、[应用接口响应](evaluations/phase3b/uat-2026-10-16-live/api-events.json)与[核验结果](evaluations/phase3b/uat-2026-10-16-live/verification.json)；本机生产构建，不是公网。 |

真实 UAT 第一份快照 7 次调用，PE≤20 改为≤45的比较计数 **7→7**、快照 ID 与证据一致：茅台/同花顺新增入选，平安银行仍入选。另一次独立手动刷新追加 7 次，不能把整轮调用说成只有 7 次。[核验文件](evaluations/phase3b/uat-2026-10-16-live/verification.json)的 `financialCalls` 记录调用计数，`checks` 记录逐股变化与证据一致性，`financialFieldChecks` 记录 ROE、61 个真实收盘价和波动率独立计算核对；原始供应商输入见上表响应链接。

记录数值属于历史获取时点，不当作最新行情。不把 UNKNOWN、错误被拒绝或部分接口成功等同于完整筛选成功。

**未验证范围：** 最终真实 UAT 的 F06–F08 明确标为 NOT VERIFIED，分别为真实供应商缺字段、Ollama 实际停机、真实 15 分钟快照到期；受控自动化异常测试不能替代这些真实场景验收，详见上表最终 UAT。

## 异常、安全与合规边界

| 范围 | 验证方式 / 当前边界 |
|---|---|
| 条件 schema、单位/窗口/报告期、有限数值、矛盾规则、AND 三值、比较解释 | 自动化可控测试，合成输入仅在测试使用；不是供应商真实异常。 |
| HTTP/业务错误、无效 JSON、超时、部分缺失、无效价格、过期数据、密钥隔离 | 客户端与规范化自动化覆盖；缺失值不补零、无虚构生产 fallback。 |
| 来源、Secure Cookie、频率限制、预算、归属与快照过期 | 自动化覆盖主要保护；当前来源/公网模式一项断言失败，HTTPS 代理和云端实际行为待验收。 |
| READY 确认、草稿保留、取消、陈旧响应、防重复、失败提示 | 组件测试覆盖，真实 PE 本机 UAT 有记录；不能从 mock READY 推断模型能力。 |
| 策略保存 / 程序化澄清 | 现有实现及测试；保存组件失败，新增功能尚未完整真实浏览器验收。 |
| 三股、三指标、无买卖建议、不预测、不交易 | 源码与界面边界可审阅；不宣称全市场或可靠投资推荐。 |
| 密钥 / 仓库卫生 | `.env.local` 保留；忽略规则覆盖环境文件（仅放行安全模板）、依赖、构建与日志。仓库整理时的静态检查与凭证扫描不等于已上传仓库的历史检查；上传后的实际跟踪清单和提交历史尚未在本轮核验。 |

覆盖范围可直接审阅：[数据接口异常](tests/client.test.ts)、[指标缺失与口径](tests/normalize.test.ts)、[行情与波动率异常](tests/volatility.test.ts)、[条件校验](tests/validation.test.ts)、[三值筛选与比较](tests/engine.test.ts)、[提案安全门控](tests/intent-validation.test.ts)、[会话归属与过期](tests/sessions.test.ts)、[部署保护](tests/deployment-security.test.ts)、[工作区交互](tests/components/workspace.test.tsx)。用例存在说明覆盖设计，不保证它们在当前版本全部通过。提案门控覆盖原文精确引用、阈值/方向、未支持指标及额外推荐字段的拒绝；界面声明可审阅 [Workspace](components/Workspace.tsx)。

## Vercel 公网部署验证（2026-10-16）

**部署平台：** Vercel（Next.js）。以下公网信息依据项目作者提供的部署状态记录；本次文档更新未重新请求公网接口或读取 Vercel Runtime Logs。

**证据限制：** `f11f395` 构建 Ready、页面可访问和 API 不可用是作者提供的状态记录，尚无仓库内 Vercel 构建日志、截图或完整运行时响应供独立核验。[公网页面地址](https://ai-stock-lens-j2ueyqub2-acme-d9c0.vercel.app/)仅作为访问入口，不证明核心功能通过。

**已确认：**

- GitHub 源代码仓库已建立并上传。
- 首次部署因 `app/api/health/route.ts` 中的可选 `Request` 参数不符合 Next.js 路由类型要求而失败。
- 修复路由参数类型后，Commit `f11f395` 已通过 Vercel 构建，部署状态为 Ready。
- 公网前端页面可以访问。

路由修复的本地开发执行记录记载：相关路由测试 **3/3 通过**，`npm run build` 通过，包括 TypeScript 检查；[相关测试源码](tests/routes.test.ts)可审阅，但该次完整执行日志未入库，计数属于尚不能从仓库独立复核的历史记录。该次没有重跑完整单元/组件套件，不覆盖上文两项历史失败。

**尚未通过：**

- 公网自然语言解析接口。
- 公网股票筛选接口及完整结果展示。
- 公网 What-if 比较功能。

**排查进度：**

- 已添加公网环境配置，并尝试重新部署。
- 截至本次记录，公网核心 API 仍不可用。
- 尚未取得足以确认根因的运行时接口响应及服务端日志，因此不能断言是金融数据提供方、密钥配置或 Serverless 架构导致。

**验证结论：** 本地核心功能具有已记录的真实接口验证证据；公网版本目前仅确认页面可访问，核心任务尚未通过端到端验收。构建 Ready 不等于核心 API 可用。

后续需通过 `/api/health`、`/api/intent`、`/api/screen` 的实际响应及 Vercel Runtime Logs 进一步定位问题。
