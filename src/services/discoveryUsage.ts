import * as api from '@/lib/api';

export const FREE_DISCOVERY_LIMIT = 5;

export async function getDiscoveryUsageCount(): Promise<number> {
  try {
    return await api.getDiscoveryCountApi();
  } catch {
    return 0;
  }
}

export async function recordDiscoveryUsage(queryText: string): Promise<boolean> {
  try {
    await api.recordDiscoveryApi(queryText);
    return true;
  } catch {
    return false;
  }
}

export async function getRemainingDiscoveryUses(): Promise<number> {
  const used = await getDiscoveryUsageCount();
  return Math.max(0, FREE_DISCOVERY_LIMIT - used);
}
