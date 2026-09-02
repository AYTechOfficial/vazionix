import type { Metadata } from 'next';
import { Suspense } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Skeleton } from '@/components/ui/Skeleton';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <>
      <h1 className="text-24 font-semibold tracking-snug">Sign in</h1>
      <p className="mt-1 text-13 text-text-3">
        Welcome back. Your streak carries over as long as you claim inside the window.
      </p>

      {/* `useSearchParams` needs a Suspense boundary for static prerendering. */}
      <Suspense fallback={<Skeleton className="mt-6 h-[320px] w-full" />}>
        <LoginForm />
      </Suspense>

      <Alert tone="info" className="mt-6">
        One account per person and per network. Multi-accounting is detected automatically and is the fastest way
        to lose a balance.
      </Alert>
    </>
  );
}
