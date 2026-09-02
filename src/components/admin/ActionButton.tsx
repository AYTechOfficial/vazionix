'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { ApiError, api } from '@/lib/api';
import { Button, type ButtonProps } from '@/components/ui/Button';
import { Field, Input, Label } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

/* ============================================================================
   ACTION BUTTON
   ----------------------------------------------------------------------------
   One button behind every one-shot operator POST that has no form of its own —
   run the lottery draw, reverse an offerwall conversion. It exists so three
   behaviours are not retyped per screen: the in-flight lock, the toast carrying
   the server's own message, and `router.refresh()` so the server-rendered
   numbers on the page agree with what just happened.

   DANGEROUS ACTIONS TYPE THEIR CONFIRMATION. `confirmWord` requires the operator
   to type the word back before the button is live. "Are you sure?" is not a
   safeguard — a dialog you dismiss by reflex is a dialog that has stopped being
   read. Typing "DRAW" is a deliberate act.
   ========================================================================== */

export interface ActionButtonProps {
  /** Path under /api/admin, e.g. `/api/admin/actions/lottery-draw`. */
  endpoint: string;
  payload?: Record<string, unknown>;
  children: React.ReactNode;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  /** Title of the confirmation dialog. Omit for an immediate POST. */
  confirmTitle?: string;
  confirmBody?: React.ReactNode;
  /** Word the operator must type. Implies a confirmation dialog. */
  confirmWord?: string;
  /** Message on success. The server's own message wins when it sends one. */
  success?: string;
  disabled?: boolean;
  className?: string;
}

export function ActionButton({
  endpoint,
  payload,
  children,
  variant = 'secondary',
  size = 'sm',
  confirmTitle,
  confirmBody,
  confirmWord,
  success = 'Done.',
  disabled = false,
  className,
}: ActionButtonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const needsDialog = Boolean(confirmTitle || confirmWord);
  const armed = !confirmWord || typed.trim().toUpperCase() === confirmWord.toUpperCase();

  const run = async () => {
    setBusy(true);
    try {
      const result = await api.post<Record<string, unknown>>(endpoint, payload);
      const message = typeof result.message === 'string' ? result.message : success;
      toast(message, 'success');
      setOpen(false);
      setTyped('');
      router.refresh();
    } catch (error) {
      toast(error instanceof ApiError ? error.message : 'That did not go through.', 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        disabled={disabled || busy}
        onClick={() => (needsDialog ? setOpen(true) : void run())}
      >
        {busy ? 'Working…' : children}
      </Button>

      {needsDialog ? (
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title={confirmTitle ?? 'Confirm'}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" disabled={!armed || busy} onClick={run}>
                {busy ? 'Working…' : 'Run it'}
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-4 text-13 leading-body text-text-2">
            {confirmBody}
            {confirmWord ? (
              <Field>
                <Label htmlFor="action-confirm">
                  Type <span className="font-mono font-semibold text-text">{confirmWord}</span> to enable
                  the button
                </Label>
                <Input
                  id="action-confirm"
                  mono
                  value={typed}
                  autoComplete="off"
                  onChange={(e) => setTyped(e.target.value)}
                />
              </Field>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </>
  );
}
