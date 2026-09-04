import 'server-only';

import { isSupabaseBackend } from '@/lib/backend';
import * as firebaseLedger from './ledger';

/* ============================================================================
   LEDGER BRIDGE — single import site for the data-backend switch
   ----------------------------------------------------------------------------
   `credit` / `debit` are the only places tokens enter or leave existence. This
   module is the ONE import site the money callers use:

     • Supabase backend  -> Postgres functions via supabase.rpc (public.credit /
                           public.debit, DB-enforced invariant + idempotency).
     • Firebase backend  -> the existing in-process Firestore ledger.

   WIRING STATUS (honest): the Supabase branch is not hooked up in this file yet.
   The Postgres functions are created and verified live (see
   supabase/migrations/0003_ledger_functions.sql and rpcCredit/rpcDebit in
   ./supabase), but the credit()/debit() callers are still resolved to the
   Firebase ledger while read paths (listLedger, countToday, earningsByDay)
   remain Firestore-backed. This module documents the intended switch and keeps
   the Firebase money path intact and green.
   ========================================================================== */

export const { credit, debit, listLedger, countToday, earningsByDay } = (() => {
  // Firebase path for now. Flip to the rpc-backed implementations here once the
  // caller port lands; the exported surface stays the same.
  return firebaseLedger;
})();

export type { LedgerPage } from './ledger';

/** Re-exported so callers can branch without importing ./ledger directly. */
export const usingSupabaseLedger = isSupabaseBackend;