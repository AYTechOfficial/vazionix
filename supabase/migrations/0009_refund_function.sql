-- ============================================================================
-- VAZIONIX — REFUND (withdrawal queue failure) as an atomic function
-- ----------------------------------------------------------------------------
-- Mirrors src/server/withdraw.ts#refundLocked: returns `tokens` from
-- locked_balance back to balance and writes a 'refund' ledger row, all in one
-- transaction so a half-refund is impossible. `p_ref_id` = withdrawal id.
-- ============================================================================
create or replace function public.refund(
  p_uid        uuid,
  p_tokens     bigint,
  p_ref_id     text,
  p_reason     text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim_id bigint;
  v_balance  bigint;
  v_locked   bigint;
begin
  update public.users
    set balance        = balance + p_tokens,
        locked_balance = locked_balance - p_tokens,
        updated_at     = now()
  where id = p_uid
  returning balance, locked_balance into v_balance, v_locked;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  insert into public.claims (user_id, source, amount, exp, ref_id, label, bonus_bps, ip, user_agent_hash, client_request_id, created_at)
  values (p_uid, 'refund', p_tokens, 0, p_ref_id, coalesce(nullif(p_reason,''), 'Withdrawal refunded'), 0, null, null, 'wdref_'||p_ref_id, now())
  returning id into v_claim_id;

  return jsonb_build_object('ok', true, 'balance', v_balance, 'claim_id', v_claim_id);
end $$;

grant execute on function public.refund(uuid, bigint, text, text) to service_role;