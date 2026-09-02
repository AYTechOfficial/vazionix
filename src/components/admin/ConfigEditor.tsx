'use client';

import * as React from 'react';
import { Check, Save } from 'lucide-react';

import { ApiError, api } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Field, Hint, Input, Label, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';

/* ============================================================================
   CONFIG EDITOR
   ----------------------------------------------------------------------------
   One form component behind every config screen, driven by a declarative field
   list. Ten bespoke forms over the same four Firestore documents would be ten
   places for a field name to drift from the server that reads it.

   FIELD PATHS ARE DOTTED
   `faucet.reward` writes `{ faucet: { reward } }`, because `saveConfig` merges and
   the server reads `economy.faucet.reward`. Flattening to `faucetReward` would
   require a translation table on both sides.

   Numbers are submitted as numbers and booleans as booleans. A cooldown saved as
   the string "2040" reads back as NaN through `Number()` on some paths and as a
   truthy string on others, which is the kind of bug that only shows up as a faucet
   that never becomes claimable.
   ========================================================================== */

export type ConfigFieldKind = 'number' | 'text' | 'longtext' | 'switch' | 'select' | 'numberList';

export interface ConfigField {
  /** Dotted path within the section document. */
  path: string;
  label: string;
  kind: ConfigFieldKind;
  hint?: string;
  /** `select` only. */
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  step?: number;
  /** Suffix rendered inside the hint line, e.g. "seconds", "tokens". */
  unit?: string;
}

export interface ConfigEditorProps {
  section: 'economy' | 'rates' | 'ads' | 'site';
  title: string;
  sub?: string;
  fields: ConfigField[];
  /** The current values, already resolved (defaults merged with Firestore). */
  values: Record<string, unknown>;
  /** Rendered under the fields — usually a note about blast radius. */
  footnote?: React.ReactNode;
}

function readPath(source: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, source);
}

function nest(path: string, value: unknown): Record<string, unknown> {
  const keys = path.split('.');
  return keys.reverse().reduce<Record<string, unknown>>(
    (acc, key, index) => (index === 0 ? { [key]: value } : { [key]: acc }),
    {} as Record<string, unknown>,
  );
}

/** Deep-merge patches so two fields in the same object do not clobber each other. */
function mergeDeep(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...target };
  for (const [key, value] of Object.entries(source)) {
    const current = out[key];
    if (
      current &&
      typeof current === 'object' &&
      !Array.isArray(current) &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      out[key] = mergeDeep(current as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function ConfigEditor({ section, title, sub, fields, values, footnote }: ConfigEditorProps) {
  const [draft, setDraft] = React.useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const field of fields) initial[field.path] = readPath(values, field.path);
    return initial;
  });

  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();

  const set = (path: string, value: unknown) => {
    setDraft((current) => ({ ...current, [path]: value }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setError(null);

    let patch: Record<string, unknown> = {};
    for (const field of fields) {
      patch = mergeDeep(patch, nest(field.path, draft[field.path]));
    }

    try {
      await api.post(`/api/admin/config/${section}`, patch);
      setSaved(true);
      toast('Saved. Live immediately — no deploy needed.', 'success');
      window.setTimeout(() => setSaved(false), 2600);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not save that.';
      setError(message);
      toast(message, 'danger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card as="section">
      <CardHead>
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {sub ? <CardSub>{sub}</CardSub> : null}
        </div>
      </CardHead>

      <CardBody className="flex flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          {fields.map((field) => {
            const id = `cfg-${field.path.replace(/\./g, '-')}`;
            const value = draft[field.path];

            if (field.kind === 'switch') {
              return (
                <label key={field.path} className="flex items-start justify-between gap-4 md:col-span-2">
                  <span className="flex min-w-0 flex-col">
                    <span className="text-13 font-semibold text-text-2">{field.label}</span>
                    {field.hint ? <span className="text-11 text-text-3">{field.hint}</span> : null}
                  </span>
                  <Switch
                    checked={value === true}
                    onChange={(e) => set(field.path, e.target.checked)}
                    aria-label={field.label}
                  />
                </label>
              );
            }

            return (
              <Field key={field.path} className={field.kind === 'longtext' ? 'md:col-span-2' : undefined}>
                <Label htmlFor={id}>{field.label}</Label>

                {field.kind === 'number' ? (
                  <Input
                    id={id}
                    mono
                    type="number"
                    min={field.min}
                    max={field.max}
                    step={field.step ?? 1}
                    value={typeof value === 'number' ? value : ''}
                    onChange={(e) => set(field.path, e.target.value === '' ? 0 : Number(e.target.value))}
                  />
                ) : field.kind === 'select' ? (
                  <Select
                    id={id}
                    value={typeof value === 'string' ? value : ''}
                    onChange={(e) => set(field.path, e.target.value)}
                  >
                    {field.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                ) : field.kind === 'longtext' ? (
                  <Textarea
                    id={id}
                    value={typeof value === 'string' ? value : ''}
                    onChange={(e) => set(field.path, e.target.value)}
                  />
                ) : field.kind === 'numberList' ? (
                  <Input
                    id={id}
                    mono
                    value={Array.isArray(value) ? (value as number[]).join(', ') : ''}
                    onChange={(e) =>
                      set(
                        field.path,
                        e.target.value
                          .split(',')
                          .map((part) => Number(part.trim()))
                          .filter((n) => Number.isFinite(n)),
                      )
                    }
                  />
                ) : (
                  <Input
                    id={id}
                    value={typeof value === 'string' ? value : ''}
                    onChange={(e) => set(field.path, e.target.value)}
                  />
                )}

                {field.hint || field.unit ? (
                  <Hint>{[field.hint, field.unit ? `In ${field.unit}.` : null].filter(Boolean).join(' ')}</Hint>
                ) : null}
              </Field>
            );
          })}
        </div>

        {error ? (
          <Alert tone="danger" className="text-12">
            {error}
          </Alert>
        ) : null}

        {footnote ? <p className="text-11 leading-body text-text-3">{footnote}</p> : null}

        <div>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saved ? <Check aria-hidden="true" /> : <Save aria-hidden="true" />}
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
