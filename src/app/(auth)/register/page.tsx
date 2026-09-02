import type { Metadata } from 'next';
import { Suspense } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Skeleton } from '@/components/ui/Skeleton';
import { RegisterForm } from '@/components/auth/RegisterForm';
import { getSiteConfig } from '@/server/config';

export const metadata: Metadata = { title: 'Create an account' };
export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const site = await getSiteConfig();

  return (
    <>
      <h1 className="text-24 font-semibold tracking-snug">Create an account</h1>
      <p className="mt-1 text-13 text-text-3">A minute to set up. Claiming starts immediately after.</p>

      {site.signupsOpen ? (
        <Suspense fallback={<Skeleton className="mt-6 h-[420px] w-full" />}>
          <RegisterForm />
        </Suspense>
      ) : (
        <Alert tone="warning" className="mt-6">
          Registration is closed right now. Existing accounts are unaffected — sign in as usual.
        </Alert>
      )}
    </>
  );
}
