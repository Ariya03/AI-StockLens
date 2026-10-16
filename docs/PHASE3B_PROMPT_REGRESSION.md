# Phase 3B：原文证据复制修复与真实模型回归

日期：2026-10-16（北京时间）。结论：两个原始 PE UAT 失败已在本轮真实模型与浏览器中修复，但完整指定回归仅 **10/16** 通过，Phase 3B 尚未达到完整验收标准；Qwen 2.5 3B 的 Phase 3A **NO-GO** 不变。

## 修改范围

- `lib/intent/prompt.ts`：新增 v3/v4，当前使用 v4。v3 只追加复制约束，真实回归 2/16，失败记录保留；v4 在新版本中替换诱导句号的格式示例，示例使用不同请求及阈值，不对两个 UAT 输入写分支。原文不补标点、必须是准确连续片段，不做清洗、改写或 trim。v1/v2 生成内容与历史提示词 SHA-256 一致。
- `lib/intent/ollama.ts`：新提示词仍固定使用原 v2 确定性校验；未修改指标、数值、运算符、原文引用、报告期、窗口及 unsupported 校验。生成版本类型与校验版本类型分开，避免新版本误跳过 v2 门控。
- `lib/server/intent.ts`：将本地实验解析请求切换至当前 v4；二次验证仍明确使用 v2，额外拒绝门控与 feature flag 不变。
- `scripts/verify-ollama-regression.ts`、`package.json`：新增独立 `npm run test:ollama`，实际本机模型、实际 handler、2 轮 × 8 用例；原单元/组件测试仍独立。失败返回非零退出码，Ollama 不可用也失败，不跳过。结果按时间保存到新目录，不覆盖历史评估。
- 本报告、README 和 `evaluations/phase3b/regression-*`：记录完整原始输出、期望、验证结果、API 响应、错误、耗时、模型元数据、提示词及 schema；另保存真实浏览器提案截图。没有修改 UI、金融引擎、股票池、历史 v1/v2 结果、schema、validator、环境文件或忽略文件；没有新依赖或付费服务。

## 原始 UAT 前后对照

之前诊断使用 v2，每个输入实际重复两次：条件都是 pe_ttm/lte/20，但证据不是原文连续子串，均 EVIDENCE_NOT_IN_INPUT → REJECTED。

| 输入 | v2 错误 evidence | v4 实际 evidence | 本轮结果 |
|---|---|---|---|
| 帮我找市盈率不超过20倍的股票。 | 市盈率不超过20倍。 | 市盈率不超过20倍 | 两轮均 READY，pe_ttm/lte/20；浏览器确认通过 |
| PE不超过20倍 | PE不超过20倍。 | PE不超过20倍 | 两轮均 READY，pe_ttm/lte/20；浏览器确认通过 |

引用没有在服务端被修补；v4 的模型输出自身已满足精确子串校验。原有单位由注册表提供，为 times；origin 为 user，没有自动添加 PE>0 或其他默认条件。

## 完整真实模型回归

使用实际本机 Ollama `qwen2.5:3b`，temperature=0、seed=42、num_ctx=8192、num_predict=1200、非流式、原 schema、90 秒请求超时。每条运行两次，两轮原始 JSON 输出相同；这只说明本轮重复结果，不保证未来稳定性。

| 输入 | 预期 | 原始模型 outcome | 校验 / API 状态 | 结果（两轮） |
|---|---|---|---|---|
| 帮我找市盈率不超过20倍的股票。 | READY | READY | 通过 → READY | PASS ×2 |
| PE不超过20倍 | READY | READY | 通过 → READY | PASS ×2 |
| PE不超过20倍。 | READY | READY | 通过 → READY | PASS ×2 |
| 市盈率小于20倍 | READY | READY | 通过 → READY | PASS ×2 |
| 不要PE大于20倍的股票 | READY | READY | OPERATOR_OR_VALUE_NOT_GROUNDED → REJECTED | FAIL ×2 |
| PE不超过20倍或ROE大于10% | UNSUPPORTED | CLARIFY | REPORT_NOT_EXPLICIT → REJECTED | FAIL ×2 |
| PE不超过20倍，股息率至少3% | UNSUPPORTED | CLARIFY | METRIC_NOT_IN_EVIDENCE → REJECTED | FAIL ×2 |
| 想找稳健的公司 | CLARIFY | CLARIFY | 通过 → CLARIFY | PASS ×2 |

逐条实际输出如下（公开合成测试输入，没有凭证或私人持仓；原样保留 JSON，不把失败改成 READY）：

**PE_LONG：帮我找市盈率不超过20倍的股票。**

```json
{
  "outcome": "READY",
  "conditions": [
    {
      "metric": "pe_ttm",
      "operator": "lte",
      "value": 20,
      "evidence": "市盈率不超过20倍"
    }
  ],
  "issues": []
}
```

**PE_NO_PUNCT：PE不超过20倍**

```json
{
  "outcome": "READY",
  "conditions": [
    {
      "metric": "pe_ttm",
      "operator": "lte",
      "value": 20,
      "evidence": "PE不超过20倍"
    }
  ],
  "issues": []
}
```

**PE_PUNCT：PE不超过20倍。**

```json
{
  "outcome": "READY",
  "conditions": [
    {
      "metric": "pe_ttm",
      "operator": "lte",
      "value": 20,
      "evidence": "PE不超过20倍。"
    }
  ],
  "issues": []
}
```

**PE_STRICT：市盈率小于20倍**

```json
{
  "outcome": "READY",
  "conditions": [
    {
      "metric": "pe_ttm",
      "operator": "lt",
      "value": 20,
      "evidence": "市盈率小于20倍"
    }
  ],
  "issues": []
}
```

**PE_NEGATION：不要PE大于20倍的股票**

```json
{
  "outcome": "READY",
  "conditions": [
    {
      "metric": "pe_ttm",
      "operator": "lt",
      "value": 20,
      "evidence": "不要PE大于20倍的股票"
    }
  ],
  "issues": []
}
```

**OR：PE不超过20倍或ROE大于10%**

```json
{
  "outcome": "CLARIFY",
  "conditions": [
    {
      "metric": "pe_ttm",
      "operator": "lte",
      "value": 20,
      "evidence": "PE不超过20倍"
    },
    {
      "metric": "roe_annual",
      "operator": "gt",
      "value": 10,
      "evidence": "ROE大于10%"
    }
  ],
  "issues": []
}
```

**DIVIDEND：PE不超过20倍，股息率至少3%**

```json
{
  "outcome": "CLARIFY",
  "conditions": [
    {
      "metric": "pe_ttm",
      "operator": "lte",
      "value": 20,
      "evidence": "PE不超过20倍"
    },
    {
      "metric": "pe_ttm",
      "operator": "gte",
      "value": 3,
      "evidence": "股息率至少3%"
    }
  ],
  "issues": []
}
```

**AMBIGUOUS：想找稳健的公司**

```json
{
  "outcome": "CLARIFY",
  "conditions": [],
  "issues": [
    {
      "kind": "AMBIGUOUS",
      "evidence": "想找稳健的公司",
      "question": "您希望用哪个指标及明确阈值衡量稳健？"
    }
  ]
}
```

否定请求错误地使用 lt20，错误排除了原意允许的等于20边界（原意为 lte20），被方向门控拒绝。OR 请求被模型当作两个候选条件，ROE 未指定 2025 年报，校验在 REPORT_NOT_EXPLICIT 处提前拒绝；没有将 OR 转成可执行 AND。股息率请求被误映射为 PE>=3，被 METRIC_NOT_IN_EVIDENCE 拒绝。这两条非 READY 原始输出还含空 issues，但校验先在条件阶段拒绝，因此本次返回的错误码不是 MISSING_CLARIFICATION。它们都没有可执行规则，但不能因为安全拒绝就计为语义回归通过：预期应是正确的 UNSUPPORTED。

真实回归命令以退出码 1 结束，明确表示 6 次失败。最终记录：`evaluations/phase3b/regression-2026-10-16T02-02-03-460Z/`。前一轮 v3 失败记录：`regression-2026-10-16T02-00-22-999Z/`。初次沙箱网络受限造成预检失败的记录也保留于 `regression-2026-10-16T01-59-44-699Z/`，它没有完成任何模型用例，不计入模型通过率；放行本机访问后才得到上述实际结果。

## 浏览器验证

在仅监听 127.0.0.1:3008 的生产构建页面上，两个原始输入均通过实际模型解析并显示待确认提案与准确引用。确认前保留四条建议草稿；点击明确的确认替换按钮后仅剩一条 PE TTM≤20 的用户条件，结果区仍为空，没有自动筛选。分别恢复建议草稿后验证第二个输入，两个输入都经过真实确认交互。

截图：`evaluations/phase3b/pe-proposal-v4.jpg`。本轮没有获取金融数据、执行筛选或 What-if；这些流程不是本次提示词修复的浏览器复验范围，不能据此宣称已复验完整金融主链路。已有引擎/组件回归保留。部署、云端模型与公共页面均未验证或实施。

## 工程检查与已知边界

- `npm test`：**138/138**（122 单元/接口/校验 + 16 组件），0 失败、0 跳过。不是模型质量指标。
- `npm run typecheck`、`npm run build`：通过。
- `npm run test:ollama`：v4 **10/16**，退出码 **1**。真实输出与状态保留完整，未修改预期以凑通过。
- 原 v1/v2 提示词生成哈希一致，历史 30 条用例与评估产物、validator/schema、`.env.local` 和 `.gitignore` 保持原内容。密钥未用于回归模型输入，也没有调用扶摇。
- v4 是局部可用性修复，不是可靠解析保证；否定、不支持概念和 OR 仍有失败，且保守校验可能误拒绝。每个 READY 仍需人工确认，手动入口继续可用，公网默认关闭，本机实验不能当作生产 AI。

可以针对两个已修复 PE 输入继续手动 UAT；**不能把 Phase 3B 标记完整完成或通过全部 UAT**。本轮停在提示词修复及如实回归报告，不继续扩展解析器、调整安全规则或部署。现有本地旧服务必须重启才能加载 v4；本次临时验证服务测试结束后停止。
