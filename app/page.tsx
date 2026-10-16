import Workspace from '../components/Workspace.tsx';
import { localIntentEnabled } from '../lib/server/intent.ts';
import { headers } from 'next/headers';
import { isLoopbackHost } from '../lib/server/deployment.ts';
export const dynamic='force-dynamic';
export default async function HomePage() {
  const host=(await headers()).get('host') ?? '';
  return <Workspace aiEnabled={localIntentEnabled() && isLoopbackHost(host)}/>;
}
