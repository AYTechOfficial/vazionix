/* Native BootKeep authentication is server-backed and uses an HTTP-only cookie. */
export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SITE_URL || typeof window !== 'undefined',
);