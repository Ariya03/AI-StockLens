# AI StockLens — Mini Product Requirements Document

**Version:** 1.1  
**Date:** 2026-10-15  
**Project:** 同花顺 AI Native 产品经理挑战 — 自然语言智能选股与策略解释器  
**Status:** MVP development specification (subject to further API and deployment validation)

## 1. Product vision and problem

AI StockLens helps individual A-share investors translate vague screening ideas into **transparent, editable, executable rules**, apply those rules to **real financial data**, and understand why a stock passed, failed, or could not be evaluated.

**Value proposition:** From “我想找估值合理、盈利能力强、走势稳定的股票” to inspectable rules and evidence-backed screening results—without hiding assumptions behind an AI answer.

This is a **research and screening tool**, not an investment-advice or automated trading product.

## 2. Target user and job to be done

**Primary user:** Individual A-share investor who can express investment preferences but is not comfortable configuring professional screening terminals.

**Job to be done:** “When I have a qualitative idea about the kinds of stocks I want to investigate, help me turn it into measurable conditions, screen an explicitly defined stock universe, and understand how changing the rules affects the results.”

**User pains:** (1) fuzzy terms are hard to operationalize; (2) filters have opaque financial definitions; (3) pass/fail decisions are hard to audit; (4) changing a threshold does not clearly explain what changed.

## 3. Product principles

1. **AI proposes; user confirms.** Distinguish user-specified constraints from suggested defaults.
2. **Rules decide; AI explains.** LLMs never invent market data or decide pass/fail independently of the deterministic engine.
3. **Evidence over confidence.** Show raw value, unit, financial period, source, retrieval time, and missingness.
4. **Unknown is not false.** Use three-valued evaluation for unavailable or invalid data.
5. **No silent scope inflation.** Always show that the MVP screens a limited A-share universe, not the whole market.
6. **No promises.** Do not provide guaranteed returns, price forecasts, or direct buy/sell instructions.

## 4. MVP scope and success criteria

### Must have

- Chinese natural-language screening intent input, with guided clarification where ambiguity materially changes the rule.
- Inspectable, editable condition panel; explicit metric definitions and defaults.
- Real financial data fetched **server-side** from 扶摇 REST API; no fabricated fallback data.
- Deterministic AND-based screening across a **defined, visible** A-share universe (initial target 30–50 stocks, conditional on API coverage/rate limits; start with 3 validated stocks for development).
- Pass / Fail / Unknown states at condition and stock level; explain each status with traceable evidence.
- What-if editing and result comparison on the **same data snapshot**.
- Handling of unsupported intent, contradictory conditions, missing data, upstream errors, and insufficient price history.
- Deployed, usable Web URL; Git repository and README; AI usage/validation log; main-path, failure, and compliance tests.

### Should have, after main path works

- Side-by-side comparison of two stocks using supported indicators.
- Save/load a strategy locally (browser storage; no account required).
- Short 60–180-second demo video if time permits.

### Out of scope

Trading, account/portfolio integration, investment recommendations, live full-market coverage, reliable historical point-in-time backtesting, push monitoring, and complex multi-factor ranking.

## 5. Primary user journey

1. **Describe:** User types “帮我找估值合理、盈利能力不错、最近走势比较稳的 A 股。”
2. **Clarify:** AI identifies ambiguous terms and suggests operational definitions; explicitly labels assumptions and unsupported interpretations.
3. **Configure:** User inspects/edits each condition's metric, operator, threshold, and applicable period/window.
4. **Run:** Deterministic engine evaluates stocks using normalized provider data.
5. **Explain:** Show pass/fail/unknown counts and per-stock, per-rule evidence.
6. **What-if:** User changes one threshold; show newly included, newly excluded, unchanged, and unknown outcomes, using the same snapshot.
7. **Next action:** Compare two stocks or save the strategy if implemented.

**UX layout:** Single-page workspace: intent/clarification at top or left; editable rules adjacent; results and explanations below or right. Clearly display stock-universe size and data status.

## 6. Supported metrics and precise definitions

The following capabilities were **actually verified on 2026-10-15** for three sample A-shares through 扶摇 REST API: PE TTM, 2025 annual-report ROE, and 92 forward-adjusted daily bars per stock for 2026-06-01 to 2026-10-15. Verification of these three stocks does **not** establish whole-market coverage, API limits, deployment access, or all field semantics.

| Metric ID | User-facing label | Example editable rule | Definition and caveat | Validation |
|---|---|---|---|---|
| `pe_ttm` | 市盈率（TTM） | `0 < PE TTM <= 25` | Provider PE TTM, unit: times. Negative/zero PE should not be silently labeled cheap; treat via explicit range. | Verified on 3 stocks |
| `roe_annual` | 净资产收益率（2025 年报） | `ROE >= 10%` | Provider `index_weighted_avg_roe` for `report=2025-4`, percentage as returned/normalized. **High ROE indicates profitability, not necessarily improving operations.** | Verified on 3 stocks |
| `daily_volatility_60d` | 近 60 个交易日日收益率波动率 | `volatility <= 2%` | Sample standard deviation of 60 consecutive daily simple returns, `r_t = close_t / close_(t-1) - 1`, multiplied by 100 to display %. Requires at least **61 valid adjusted closing prices**; non-annualized. Label this definition in UI. | Sufficient daily data verified; derived metric still needs unit tests |

**Data interpretation:** The reported valuation response timestamp was **2026-10-15 18:55:49 Beijing time**, but this does not mean every financial/price field shares that timestamp. Store provider timestamps where available, plus separate `retrievedAt` for each request. The 2025 annual ROE response included report period but no verified disclosure date; do not claim historical point-in-time availability.

**Important semantic guardrail:** “经营改善” requires change over time; a single annual ROE cannot establish improvement. If user says “经营改善”, explain the limitation and ask whether to use “盈利能力较强（ROE）” as a proxy **or** request a supported growth metric once verified. Never silently substitute.

**Candidate future metric (not yet verified):** `net_profit_yoy_growth_ratio` for a specific reporting period. Enable only after field availability, units, and meaning are tested.

## 7. Requirements and acceptance criteria

### FR-01 Intent interpretation and clarification

- Parse Chinese screening requests into a validated condition schema.
- Separate `userSpecified` from `suggestedDefault`; show each default as editable.
- Ask concise clarification for materially ambiguous phrases, such as “经营改善”.
- Unsupported metrics are explicitly surfaced and excluded only after user acknowledgment.
- If LLM access is unavailable, provide a clearly labeled **guided rule-builder fallback**, not a fake AI response; record this as a degraded mode.

**Acceptance:** An explicit “PE 不超过 20 倍” produces threshold 20, not 25; “经营改善” triggers an explanation instead of a false growth claim.

### FR-02 Editable strategy

- Conditions have metric ID, operator, numeric threshold(s), unit, and report/window parameters.
- Initial MVP uses AND across conditions; UI makes this visible.
- Validate numeric ranges, invalid units, impossible bounds, and contradictory conditions before execution.
- Provide reset and rerun.

**Acceptance:** A conflicting `PE > 30` and `PE < 10` combination is blocked with a specific explanation.

### FR-03 Real data and screening

- Fetch data through server-only 扶摇 adapter, never exposing API key to the browser or repository.
- Check both HTTP status and business response `code` (successful tests returned `code=0`).
- Normalize missing, malformed, stale/unknown-timestamp, and error cases.
- Compute volatility deterministically from adjusted closes, sorted by trading date, rejecting duplicates/invalid prices.
- Rule evaluation: `PASS` when known and satisfied; `FAIL` when known and not satisfied; `UNKNOWN` when missing/invalid/not fetched.
- Stock aggregation with AND: any `FAIL` => `EXCLUDED`; otherwise any `UNKNOWN` => `UNKNOWN`; all `PASS` => `INCLUDED`.
- Never substitute mock data into a real-data result path.

**Acceptance:** An API failure produces an explicit unavailable/error state, not fabricated screening results. Missing ROE must not become zero.

### FR-04 Evidence and explainability

For each stock and rule show: actual value, comparison, outcome, data source, report period/window, units, provider timestamp if available, retrieval timestamp, and missing/error reason when relevant. Separate raw data facts from generated narrative.

**Acceptance:** User can identify exactly which condition excluded a stock and the underlying reported value.

### FR-05 What-if comparison

- Preserve one immutable normalized data snapshot per screening session.
- Re-evaluate changed rules against that snapshot; do not silently refetch during comparison.
- Report `newlyIncluded`, `noLongerIncluded`, `stillIncluded`, and unknown transitions; make changed rules visible.
- If user explicitly refreshes data, start a new snapshot and warn that before/after results are not strictly comparable.

**Acceptance:** Editing PE max 25→45 recomputes decisions without a new provider request and shows changed stock membership.

### FR-06 Compliance and limitations

- Prominent notice: research/screening only, not investment advice.
- No promised returns, certainty claims, buy/sell recommendations, or made-up metrics.
- Identify limited stock universe and data freshness/coverage limitations.

**Acceptance:** A request for “稳赚” or a guaranteed winner does not produce a promise; product redirects to objective, editable screening criteria.

## 8. Technical architecture (implementation guidance, not mandated design)

**Preferred stack:** Next.js + TypeScript; deploy on Vercel if server-side connectivity is verified.

- `app/` — UI and server routes.
- `lib/fuyao/` — authenticated server-only API client and response parsing.
- `lib/metrics/` — financial field normalization and volatility computation.
- `lib/screening/` — schema, rule validation, three-valued evaluation, aggregation, snapshot comparison.
- `lib/intent/` — LLM prompt, structured output validation, and fallback guided parsing.
- `tests/` — unit/integration cases and reproducible validation fixtures.

**Suggested schema:**

```ts
type MetricId = 'pe_ttm' | 'roe_annual' | 'daily_volatility_60d';
type Operator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
type Rule = {
  id: string;
  metric: MetricId;
  operator: Operator;
  value: number;
  origin: 'user' | 'suggested';
  period?: string;
};
type RuleResult = {
  ruleId: string;
  status: 'PASS' | 'FAIL' | 'UNKNOWN';
  actualValue?: number;
  reason: string;
};
type StockStatus = 'INCLUDED' | 'EXCLUDED' | 'UNKNOWN';
```

Add explicit types for normalized data provenance (`provider`, `sourceField`, `reportPeriod`, `providerTimestamp?`, `retrievedAt`, `unit`, `adjustment`, `error?`) and immutable snapshot IDs.

**Security:** `.env.local` contains `FUYAO_API_KEY` and is ignored by Git. Confirm before initializing/pushing repository; never log the key. Cloud deployment must use server-side environment variables. Respect API usage restrictions and avoid claiming redistribution permission without checking terms.

## 9. Confirmed API feasibility and open risks

**Confirmed from Codex's live check:**

- Three stocks: 贵州茅台 `600519.SH`, 平安银行 `000001.SZ`, 同花顺 `300033.SZ`.
- PE TTM: `20.155217`, `5.094952`, `41.476721` respectively.
- 2025 annual ROE: `32.53%`, `9.15%`, `38.54%` respectively.
- 92 valid forward-adjusted daily bars each; 2026-06-01 through 2026-10-15.
- Seven calls succeeded (1 batch valuation, 3 financial, 3 history), HTTP 200 and business `code=0`; successful call latency ~0.14–0.44 s.
- Initial Python certificate trust issue resolved using system network tooling **without disabling TLS verification**.

**Not yet confirmed:** 30–50-stock coverage, batching/rate limits, deployment network access, disclosure dates for ROE, independent source consistency, exact business API contract under errors, and production LLM access.

## 10. Test plan

| Test | Expected outcome |
|---|---|
| Explicit PE threshold | Preserve user threshold exactly |
| Ambiguous “经营改善” | Clarify or explain proxy; no silent ROE substitution |
| Contradictory filters | Block and explain |
| Three validated real stocks | Fetch and evaluate PE, ROE, and derived volatility |
| Missing ROE | UNKNOWN for affected rule; correct stock aggregation |
| Missing/duplicate/nonpositive closes | UNKNOWN volatility with reason |
| 60 returns / 61 prices | Compute sample SD correctly; display percent |
| Fewer than 61 valid prices | UNKNOWN volatility |
| HTTP error / business error / timeout | Visible error; no fake numbers |
| Edit PE threshold | Recompute on same snapshot; show stock changes |
| Unsupported metric | Explicitly identify as unsupported |
| Guaranteed-return request | No guarantee or trade instruction |
| Secret hygiene | No key in client bundle, logs, Git status, or README |

## 11. Delivery plan (24-hour challenge)

**Phase 1 — Data and deterministic engine:** server-side API adapter, normalization, volatility calculation, tri-state evaluation, automated tests. Use three validated stocks first.

**Phase 2 — Core workspace:** editable conditions, result cards/table, provenance details, limited visible stock universe, What-if same-snapshot comparison.

**Phase 3 — AI intent and polish:** structured interpretation, clarification UX, graceful fallback, error states, compliance copy, mobile responsiveness.

**Phase 4 — Delivery:** verify deployment and data access; README/setup; AI use and verification log; test report; optional short demo.

**Scope cut rule:** If time is short, preserve the full real-data + editable-rules + explainability + What-if path. Cut stock comparison, saved strategies, extra metrics, and cosmetic refinements before compromising data integrity.

## 12. Definition of done

- [ ] Public Web URL loads and completes one real-data screening flow.
- [ ] User can inspect and edit rules before execution.
- [ ] At least one ambiguous request is clarified transparently.
- [ ] Every stock status can be traced to real field values or an explicit unknown reason.
- [ ] What-if works on the same data snapshot.
- [ ] Main path, upstream failure, missing-data, and compliance tests documented.
- [ ] Repository has setup README, environment variable instructions (without secrets), and AI usage/validation log.
- [ ] Limited universe, freshness caveats, and non-advice notice visible.
