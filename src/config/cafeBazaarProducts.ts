import type { PlanId } from '@/data/plans';

export const CAFE_BAZAAR_PRODUCTS = {
  basic: {
    1: 'kateb_basic_1m',
    3: 'kateb_basic_3m',
    6: 'kateb_basic_6m',
  },
  pro: {
    1: 'kateb_pro_1m',
    3: 'kateb_pro_3m',
    6: 'kateb_pro_6m',
  },
} as const;

export type BazaarProductId =
  | 'kateb_basic_1m'
  | 'kateb_basic_3m'
  | 'kateb_basic_6m'
  | 'kateb_pro_1m'
  | 'kateb_pro_3m'
  | 'kateb_pro_6m';

export type BillingMonths = 1 | 3 | 6;

export function getCafeBazaarProductId(
  planId: PlanId,
  months: BillingMonths,
): BazaarProductId | null {
  if (planId !== 'basic' && planId !== 'pro') return null;
  return CAFE_BAZAAR_PRODUCTS[planId][months] ?? null;
}
