'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Pencil, Plus, Trash2 } from 'lucide-react';

import { relative } from '@/lib/format';
import { ApiError, api } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, Hint, Input, Label, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Pill } from '@/components/ui/Pill';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';

/* ============================================================================
   CATALOGUE EDITOR
   ----------------------------------------------------------------------------
   One CRUD surface behind all five editable catalogues — PTC campaigns,
   shortlinks, offerwall providers, challenges, coupons. Each screen supplies a
   declarative field list and nothing else.

   WHY ONE COMPONENT AND NOT FIVE
   The five collections differ only in their fields; the create/edit/delete
   mechanics, the optimistic-free `router.refresh()`, the error surfacing and the
   enabled toggle are identical. Five copies would be five places for the field
   name written by the form to drift from the field name the earning engine reads,
   and that drift is invisible until a campaign silently pays nothing.

   NO OPTIMISTIC UPDATES. A saved row is re-read from the server, because the
   server owns the document id (a coupon's id is derived from its code, upper-cased)
   and a row that appears in the table before the write lands is a row that lies
   when the write fails.
   ========================================================================== */

export type CatalogueFieldKind =
  | 'text'
  | 'longtext'
  | 'number'
  | 'switch'
  | 'select'
  | 'url'
  | 'date';

/** Structurally identical to `CatalogueRow` in `src/server/admin.ts`, declared
    here so a client component never reaches into a `server-only` module. */
export interface CatalogueItem {
  id: string;
  enabled: boolean;
  fields: Record<string, unknown>;
  updatedAt: string | null;
}

export interface CatalogueField {
  key: string;
  label: string;
  kind: CatalogueFieldKind;
  hint?: string;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  step?: number;
  /** Shown in the table as well as the form. Keep this to four or five. */
  column?: boolean;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | number | boolean;
}

export interface CatalogueEditorProps {
  /** Whitelisted collection name — `ptcAds`, `shortlinks`, … */
  collection: 'ptcAds' | 'shortlinks' | 'offerwallProviders' | 'challenges' | 'coupons';
  /** Singular noun for buttons and dialogs: "PTC campaign". */
  noun: string;
  fields: CatalogueField[];
  rows: CatalogueItem[];
  /** Resolved server-side from the verified session. */
  canEdit: boolean;
  /** Extra line under each row's name, with `{id}` replaced by the document id.
      A template string rather than a render function because a function cannot
      cross the server/client boundary. */
  detailTemplate?: string;
  detailLabel?: string;
  /** Which field is the row's display name in the table. */
  titleKey?: string;
}

function initialDraft(fields: CatalogueField[], row: CatalogueItem | null): Record<string, unknown> {
  const draft: Record<string, unknown> = {};
  for (const field of fields) {
    const existing = row?.fields[field.key];
    if (existing !== undefined && existing !== null) {
      draft[field.key] = existing;
      continue;
    }
    draft[field.key] =
      field.defaultValue ?? (field.kind === 'switch' ? true : field.kind === 'number' ? 0 : '');
  }
  if (row) draft['enabled'] = row.enabled;
  return draft;
}

function display(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return value.toLocaleString('en-US');
  return String(value);
}

export function CatalogueEditor({
  collection,
  noun,
  fields,
  rows,
  canEdit,
  detailTemplate,
  detailLabel,
  titleKey,
}: CatalogueEditorProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [editing, setEditing] = React.useState<CatalogueItem | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [draft, setDraft] = React.useState<Record<string, unknown>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);

  const columns = fields.filter((f) => f.column);
  const nameKey = titleKey ?? fields[0]?.key ?? 'id';

  const openCreate = () => {
    setCreating(true);
    setEditing(null);
    setDraft(initialDraft(fields, null));
    setError(null);
  };

  const openEdit = (row: CatalogueItem) => {
    setEditing(row);
    setCreating(false);
    setDraft(initialDraft(fields, row));
    setError(null);
  };

  const close = () => {
    setEditing(null);
    setCreating(false);
    setError(null);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { ...draft };
      if (editing) payload['id'] = editing.id;
      if (payload['enabled'] === undefined) payload['enabled'] = true;

      for (const field of fields) {
        if (field.required && (payload[field.key] === '' || payload[field.key] === undefined)) {
          throw new ApiError(`${field.label} is required.`, 400, 'required');
        }
      }

      await api.post(`/api/admin/catalogue/${collection}`, payload);
      toast(`${noun} saved.`, 'success');
      close();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: CatalogueItem) => {
    setBusy(true);
    try {
      await api.del(`/api/admin/catalogue/${collection}?id=${encodeURIComponent(row.id)}`);
      toast(`${noun} deleted.`, 'success');
      close();
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not delete that.', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      toast('The browser refused clipboard access.', 'warning');
    }
  };

  const set = (key: string, value: unknown) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <section className="rounded-md border border-line bg-surface-1">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h3 className="text-14 font-semibold text-text">
            {rows.length} {rows.length === 1 ? noun.toLowerCase() : `${noun.toLowerCase()}s`}
          </h3>
          <p className="text-11 text-text-3">
            Stored in <code className="font-mono">/{collection}</code>. Changes are live immediately.
          </p>
        </div>
        <Button variant="primary" size="sm" disabled={!canEdit} onClick={openCreate}>
          <Plus aria-hidden="true" />
          New {noun.toLowerCase()}
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-13 text-text-3">
          Nothing in <code className="font-mono">/{collection}</code> yet. The first record appears here the
          moment you save one.
        </p>
      ) : (
        <div className="w-full overflow-auto">
          <table className="vf-table">
            <caption className="sr-only">{noun} catalogue</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                {columns.map((c) => (
                  <th key={c.key} scope="col" className={c.kind === 'number' ? 'th-num' : undefined}>
                    {c.label}
                  </th>
                ))}
                <th scope="col">State</th>
                <th scope="col">Updated</th>
                <th scope="col">
                  <span className="sr-only">Edit</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <span className="flex min-w-0 flex-col">
                      <span className="font-semibold text-text">{display(row.fields[nameKey])}</span>
                      <button
                        type="button"
                        onClick={() => copy(row.id)}
                        className="inline-flex items-center gap-1 text-left font-mono text-11 text-text-3 hover:text-mint"
                        aria-label={`Copy document id ${row.id}`}
                      >
                        {row.id}
                        {copied === row.id ? (
                          <Check aria-hidden="true" className="size-3 text-mint" />
                        ) : (
                          <Copy aria-hidden="true" className="size-3 opacity-40" />
                        )}
                      </button>
                      {detailTemplate ? (
                        <span className="mt-1 flex flex-col text-11 text-text-3">
                          {detailLabel ? <span>{detailLabel}</span> : null}
                          <code className="font-mono text-11 text-text-2">
                            {detailTemplate.replace('{id}', row.id)}
                          </code>
                        </span>
                      ) : null}
                    </span>
                  </td>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={c.kind === 'number' ? 'td-num tabular' : 'text-text-3'}
                    >
                      {display(row.fields[c.key])}
                    </td>
                  ))}
                  <td>
                    {row.enabled ? <Pill tone="success">Enabled</Pill> : <Pill tone="neutral">Off</Pill>}
                  </td>
                  <td className="text-text-3">{relative(row.updatedAt)}</td>
                  <td>
                    <Button variant="ghost" size="sm" disabled={!canEdit} onClick={() => openEdit(row)}>
                      <Pencil aria-hidden="true" />
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating || editing ? (
        <Modal
          open
          onClose={close}
          title={creating ? `New ${noun.toLowerCase()}` : `Edit ${display(editing?.fields[nameKey])}`}
          description={
            editing
              ? `/${collection}/${editing.id}`
              : `Writes a new document to /${collection}. The earning surface picks it up on the next read.`
          }
          className="w-[min(680px,calc(100vw-32px))]"
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2">
              {editing ? (
                <Button variant="danger" size="sm" disabled={busy} onClick={() => remove(editing)}>
                  <Trash2 aria-hidden="true" />
                  Delete
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <Button variant="primary" disabled={busy} onClick={save}>
                  {busy ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              {fields.map((field) => {
                const id = `cat-${collection}-${field.key}`;
                const value = draft[field.key];

                if (field.kind === 'switch') {
                  return (
                    <label
                      key={field.key}
                      className="flex items-start justify-between gap-4 md:col-span-2"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="text-13 font-semibold text-text-2">{field.label}</span>
                        {field.hint ? <span className="text-11 text-text-3">{field.hint}</span> : null}
                      </span>
                      <Switch
                        checked={value === true}
                        onChange={(e) => set(field.key, e.target.checked)}
                        aria-label={field.label}
                      />
                    </label>
                  );
                }

                return (
                  <Field
                    key={field.key}
                    className={field.kind === 'longtext' || field.kind === 'url' ? 'md:col-span-2' : undefined}
                  >
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
                        onChange={(e) => set(field.key, e.target.value === '' ? 0 : Number(e.target.value))}
                      />
                    ) : field.kind === 'select' ? (
                      <Select
                        id={id}
                        value={typeof value === 'string' ? value : ''}
                        onChange={(e) => set(field.key, e.target.value)}
                      >
                        <option value="">Choose…</option>
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
                        placeholder={field.placeholder}
                        onChange={(e) => set(field.key, e.target.value)}
                      />
                    ) : field.kind === 'date' ? (
                      <Input
                        id={id}
                        mono
                        type="date"
                        value={typeof value === 'string' ? value.slice(0, 10) : ''}
                        onChange={(e) => set(field.key, e.target.value)}
                      />
                    ) : (
                      <Input
                        id={id}
                        mono={field.kind === 'url'}
                        value={typeof value === 'string' ? value : ''}
                        placeholder={field.placeholder}
                        onChange={(e) => set(field.key, e.target.value)}
                      />
                    )}

                    {field.hint ? <Hint>{field.hint}</Hint> : null}
                  </Field>
                );
              })}
            </div>

            {error ? <Alert tone="danger">{error}</Alert> : null}
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
