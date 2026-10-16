import { createScreeningHandlers } from '../../../lib/server/handlers.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const POST = createScreeningHandlers().compare;
