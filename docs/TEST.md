# 测试说明

覆盖题目要求的主链路、数据/接口异常和合规边界。自动化命令：

```sh
npm test
npm run typecheck
```

`npm test` 运行 Node 内置测试（`tests/*.test.ts`）和组件测试（`tests/components/*.test.tsx`）。合成夹具只用于测试，产品取数路径不导入它们。

真实网络：

| 命令 | 覆盖 | 条件 |
|---|---|---|
| `npm run test:live` | 三股真实 PE/ROE/行情字段 | `.env.local` 中的扶摇密钥 |
| `npm run test:phase2:live` | 筛选 + 同快照比较，比较期间上游 +0 | 同上 |
| `npm run test:ollama` | 本机模型回归，失败不跳过 | 本机 `qwen2.5:3b`，不加载密钥 |

## 主链路

| 场景 | 证据 |
|---|---|
| 模糊中文（经营改善、估值合理、走势相对稳定）→ 澄清，无可执行规则 | `tests/deterministic-intent.test.ts` |
| 明确「PE不超过20倍」→ 待确认条件，原文证据，确认前不筛选 | `tests/deterministic-intent.test.ts`、`tests/intent-api.test.ts`、组件测试 |
| 示例策略 / 手动改阈值 / 冲突区间阻止执行 | `tests/workspace.test.ts`、`tests/components/workspace.test.tsx`、`tests/validation.test.ts` |
| 真实筛选：入选/排除/无法判断 + 字段、时点、口径 | `docs/PHASE2_VALIDATION.md`、`evaluations/phase3b/uat-2026-10-16-live/UAT_REPORT.md` |
| 改阈值后同快照比较，不重新取数 | `tests/session-integration.test.ts`、Phase 2 / UAT 的上游计数 7→7 |
| 保存/读取条件只动草稿，不自动筛选 | `tests/workspace.test.ts`、组件测试 |

UAT 可追溯数字（2026-10-16，快照 `957d9df5-47af-43cc-97c5-1fbfda48f50e`）：茅台 PE 20.217234，平安银行 5.161932，同花顺 41.4026。≤20 时仅平安银行入选；≤45 后三股均入选。ROE 与 60 日波动率在 `verification.json` 中与原始响应核对（波动率复算误差 < 1e-12）。

## 数据缺失与接口失败

| 场景 | 期望 | 证据 |
|---|---|---|
| 缺字段、无效值、过期时点 | UNKNOWN，不补数 | `tests/engine.test.ts`、`tests/normalize.test.ts` |
| HTTP 429/500、业务错误码、超时、JSON 损坏 | 明确错误；不泄露密钥或上游原文 | `tests/client.test.ts` |
| 部分上游失败 | 成功指标保留，失败指标 UNKNOWN，快照只读 | `tests/client.test.ts` |
| 比较时快照过期 / 他人 Cookie | 410 / 404，不静默取数 | `tests/session-integration.test.ts`、`tests/sessions.test.ts` |
| 密钥缺失 | 不发起扶摇请求 | `tests/client.test.ts` |

浏览器 UAT 中，真实缺字段（F06）、Ollama 宕机（F07）、15 分钟 TTL 到期（F08）标记为 **NOT VERIFIED**，不以单元测试冒充那三次现场故障。缺失与过期路径以自动化测试为准。

## 极端与合规边界

| 场景 | 期望 | 证据 |
|---|---|---|
| PE>30 且 PE≤20 | 中文冲突，按钮禁用，不取数 | 组件测试、UAT F05 |
| 空阈值 | 不静默变 0 | 组件测试、`tests/workspace.test.ts` |
| OR、股息率、买入/稳赚 | 不执行、不部分应用 | `tests/deterministic-intent.test.ts`、`tests/intent-validation.test.ts`、UAT F02/F03 |
| 额外推荐/价格字段 | 进不了可执行规则 | `tests/intent-validation.test.ts` |
| 公开环境误开 `STOCKLENS_LOCAL_AI` | 仍禁用 Ollama | `tests/deployment-security.test.ts`、`tests/intent-api.test.ts` |
| 伪造快照或比较基准 | 400/拒绝 | `tests/session-integration.test.ts` |
| Origin 伪造、无 Origin 的公开取数、超限 429 | 不花费上游预算 | `tests/deployment-security.test.ts` |
| 页面声明 | 不构成投资建议；事实与无法判断分开 | 组件测试、页脚、筛选响应 `notice` |

## 已知测试边界

- 股票池 3 只、指标 3 个，不能外推全市场。
- 7 日新鲜度是产品规则，不是供应商 SLA。
- 云端 Render 真实验收在部署后补做，本文件先记录本地与本机 UAT。
- 历史评估目录不要用新脚本覆盖；复验会写新的时间戳目录。
