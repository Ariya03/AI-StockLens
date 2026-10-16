export type MetricId = 'pe_ttm' | 'roe_annual' | 'daily_volatility_60d';
export type Unit = 'times' | 'percent';
export type Operator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
export type Rule = Readonly<{
  id: string; metric: MetricId; operator: Operator; value: number;
  unit: Unit; origin: 'user' | 'suggested'; period?: '2025-4'; window?: 60;
}>;
export type DataIssue = Readonly<{ code: string; reason: string }>;
export type Provenance = Readonly<{
  provider: '扶摇'; endpoint: string; sourceField: string; unit: Unit;
  retrievedAt: string; providerTimestamp: string | null;
  timestampStatus: 'known' | 'missing' | 'invalid' | 'not-provided';
  requestId: string | null; reportPeriod?: '2025-4'; disclosureDate?: null;
  adjustment?: 'forward'; window?: 60; windowStart?: string; windowEnd?: string;
  definition: string;
}>;
export type MetricData = Readonly<{
  value: number | null; rawValue: number | string | null;
  provenance: Provenance; issue: DataIssue | null;
  derivedInputs?: Readonly<{ dates: readonly string[]; closes: readonly number[] }>;
}>;
export type StockData = Readonly<{
  code: string; name: string; metrics: Readonly<Record<MetricId, MetricData>>;
}>;
export type Snapshot = Readonly<{
  id: string; createdAt: string; asOf: string;
  universe: Readonly<{ name: string; limited: true; size: number }>;
  stocks: readonly StockData[];
}>;
export type RuleResult = Readonly<{
  rule: Rule; status: 'PASS' | 'FAIL' | 'UNKNOWN'; actualValue: number | null;
  reason: string; evidence: MetricData;
}>;
export type StockStatus = 'INCLUDED' | 'EXCLUDED' | 'UNKNOWN';
export type StockResult = Readonly<{ code: string; name: string; status: StockStatus; rules: readonly RuleResult[] }>;
export type ScreeningResult = Readonly<{
  snapshotId: string; logic: 'AND'; rules: readonly Rule[]; stocks: readonly StockResult[];
  counts: Readonly<Record<StockStatus, number>>;
}>;
