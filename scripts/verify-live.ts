import assert from 'node:assert/strict';
import { fetchSnapshot } from '../lib/fuyao/snapshot.ts';
import { screen, compareRules } from '../lib/screening/engine.ts';
import { DEFAULT_RULES } from '../lib/screening/defaults.ts';
import { createFuyaoClient, ENDPOINTS } from '../lib/fuyao/client.ts';
import type { ApiResult, FuyaoClient } from '../lib/fuyao/client.ts';

// Live provider values only; no fixture fallback and no raw errors or credentials logged.
const upstream = createFuyaoClient();
const calls: { endpoint: string; httpStatus: number | null; businessCode: number | null; requestId: string | null; historyBars?: number }[] = [];
async function record(endpoint: string, pending: Promise<ApiResult>) {
  const result = await pending;
  const data = result.data as { item?: unknown[] } | null;
  calls.push({ endpoint, httpStatus: result.httpStatus, businessCode: result.businessCode, requestId: result.requestId,
    ...(endpoint === ENDPOINTS.historical ? { historyBars: Array.isArray(data?.item) ? data.item.length : 0 } : {}) });
  return result;
}
const client: FuyaoClient = {
  valuations: codes => record(ENDPOINTS.valuations,upstream.valuations(codes)),
  financials: code => record(ENDPOINTS.financials,upstream.financials(code)),
  historical: (code,start,end) => record(ENDPOINTS.historical,upstream.historical(code,start,end)),
};
const snapshot = await fetchSnapshot({client});
const result = screen(snapshot,DEFAULT_RULES);
let failed = false;
for (const stock of snapshot.stocks) {
  const metrics = Object.entries(stock.metrics).map(([metric,data]) => ({ metric, value: data.value,
    issue: data.issue, unit: data.provenance.unit, reportPeriod: data.provenance.reportPeriod,
    windowStart: data.provenance.windowStart, windowEnd: data.provenance.windowEnd,
    providerTimestamp: data.provenance.providerTimestamp, retrievedAt: data.provenance.retrievedAt,
    requestId: data.provenance.requestId }));
  if (metrics.some(m => m.issue || m.value === null)) failed = true;
  console.log(JSON.stringify({ code: stock.code, name: stock.name, metrics, result: result.stocks.find(s => s.code === stock.code)!.status }));
}
const changed = DEFAULT_RULES.map(r => r.id === 'pe-max' ? { ...r, value: 45 } : r);
const whatIf = compareRules(snapshot,DEFAULT_RULES,changed);
const peOnly = DEFAULT_RULES.filter(r => r.metric === 'pe_ttm');
const peOnlyWhatIf = compareRules(snapshot,peOnly,peOnly.map(r => r.id === 'pe-max' ? {...r,value:45} : r));
assert.equal(calls.length,7,'What-if must not refetch provider data');
assert.equal(whatIf.snapshotId,snapshot.id);
assert.ok(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.stocks[0].metrics));
console.log(JSON.stringify({ snapshotId: snapshot.id, universe: snapshot.universe, counts: result.counts,
  whatIf: { changedRuleIds: whatIf.changedRuleIds, newlyIncluded: whatIf.newlyIncluded,
    noLongerIncluded: whatIf.noLongerIncluded, stillIncluded: whatIf.stillIncluded,
    unknownTransitions: whatIf.unknownTransitions }, peOnlyWhatIf: { newlyIncluded: peOnlyWhatIf.newlyIncluded, stillIncluded: peOnlyWhatIf.stillIncluded },
  calls, additionalWhatIfProviderCalls: calls.length-7, liveMetricsVerified: !failed }));
if (failed) process.exitCode = 1;
