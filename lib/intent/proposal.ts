import type { Rule } from '../screening/types.ts';
export type IntentProposal = {
  status: 'READY' | 'CLARIFY' | 'UNSUPPORTED' | 'REJECTED';
  rules: readonly Rule[];
  evidence: string[];
  issues: { evidence: string; message: string }[];
  message: string;
};
