import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell/PageHeader';
import { AdBanner, AdUnit } from '@/components/ads/AdUnit';
import { CouponPanel } from '@/components/pages/coupon/CouponPanel';
import { listRedemptions } from '@/server/earn/coupon';
import { requireUser } from '@/server/session';

export const metadata: Metadata = { title: 'Coupons' };
export const dynamic = 'force-dynamic';

export default async function CouponPage() {
  const claims = await requireUser();
  const redemptions = await listRedemptions(claims.uid, 25);

  return (
    <>
      <AdUnit placement="coupon.top" className="mb-4" />

      <PageHeader title="Coupons" sub="Redeem a code for tokens or advertiser credit" />

      <CouponPanel initial={redemptions} />

      <AdBanner placement="coupon.bottom" />
    </>
  );
}
