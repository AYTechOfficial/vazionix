'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Pencil, Search, Trash2 } from 'lucide-react';

import { nf } from '@/lib/format';
import { ApiError, api } from '@/lib/api';
import { AD_FORMATS, AD_FORMAT_IDS, formatDimensions, type AdFormatId } from '@/lib/ads/formats';
import { envKeyFor, type AdUnitKind } from '@/lib/ads/config';
import type { PlacementId } from '@/lib/ads/placements';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, Hint, Input, Label, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Pill } from '@/components/ui/Pill';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';

/* ============================================================================
   AD INVENTORY EDITOR
   ----------------------------------------------------------------------------
   The screen the owner earns money from. Every physical ad position in the
   product is a row; filling one means pasting a network's tag into the modal and
   saving, and the slot goes live on the next render with no deploy.

   WHY THE PLACEMENT LIST IS THE SOURCE, NOT THE DOCUMENTS
   The table iterates `PLACEMENTS` and LEFT-JOINS `/adUnits`, never the reverse.
   An inventory screen built from the documents can only ever show what is already
   filled, which is the opposite of what this screen is for: the empty rows are
   the work. `filled / total` in the header is the one number that says how much
   of the site is earning.

   WHY THE KIND SELECTOR CARRIES GUIDANCE
   The four kinds map onto the four shapes ad networks actually ship, and picking
   the wrong one produces a slot that silently renders nothing — the single
   hardest failure to debug from a dashboard. So each kind states, in the modal,
   what to paste: a whole snippet, a bare loader URL, a loader plus the div id it
   targets, or a destination link.

   NOTHING HERE SANITISES THE SNIPPET, deliberately. Every network on earth ships
   `document.write`-era markup; the control is the sandboxed iframe in
   `AdUnit.tsx` plus the `ads.edit` gate on the route this posts to.
   ========================================================================== */

export interface InventoryRow {
  placement: PlacementId;
  page: string;
  position: string;
  format: AdFormatId;
  mobileFormat: AdFormatId;
  note?: string | undefined;
  /** From `/adUnits/{placement}`, when the document exists. */
  unit: {
    kind: string;
    network: string;
    enabled: boolean;
    hasPayload: boolean;
    capPerSession: number;
    updatedAt: string | null;
  } | null;
}

const KIND_GUIDE: Record<AdUnitKind, { label: string; blurb: string }> = {
  html: {
    label: 'HTML snippet',
    blurb:
      'Paste the network’s whole snippet, both script tags and all. This is the Adsterra banner/native shape (atOptions object plus the invoke.js loader) and the AdsLab invoke shape.',
  },
  script: {
    label: 'Script loader',
    blurb:
      'One bare loader URL, no container. Social bar, popunder and in-page push are all this shape — the network positions the unit itself.',
  },
  container: {
    label: 'Container + loader',
    blurb:
      'A loader URL plus the id of the div it fills. AdSense and some AdsLab zones work this way: the script looks for an element that must already exist.',
  },
  url: {
    label: 'Destination URL',
    blurb:
      'A direct link or smartlink. Not markup — the shortlink engine sends users through it, so it earns per visit rather than per impression.',
  },
};

const KINDS = Object.keys(KIND_GUIDE) as AdUnitKind[];

interface Draft {
  placement: PlacementId;
  kind: AdUnitKind;
  html: string;
  src: string;
  containerId: string;
  url: string;
  network: string;
  format: AdFormatId | '';
  enabled: boolean;
  capPerSession: number;
  geo: string;
}

function blankDraft(row: InventoryRow): Draft {
  return {
    placement: row.placement,
    kind: (row.unit?.kind as AdUnitKind) ?? defaultKindFor(row.format),
    html: '',
    src: '',
    containerId: '',
    url: '',
    network: row.unit?.network && row.unit.network !== '—' ? row.unit.network : '',
    format: '',
    enabled: row.unit?.enabled ?? true,
    capPerSession: row.unit?.capPerSession ?? 0,
    geo: '',
  };
}

/** An overlay format cannot be an HTML box and a link format is never a script. */
function defaultKindFor(format: AdFormatId): AdUnitKind {
  const kind = AD_FORMATS[format].kind;
  if (kind === 'link') return 'url';
  if (kind === 'overlay') return 'script';
  return 'html';
}

export function AdInventoryEditor({ rows, canEdit }: { rows: InventoryRow[]; canEdit: boolean }) {
  const router = useRouter();
  const { toast } = useToast();

  const [query, setQuery] = React.useState('');
  const [only, setOnly] = React.useState<'all' | 'filled' | 'empty'>('all');
  const [editing, setEditing] = React.useState<InventoryRow | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const live = Boolean(row.unit?.hasPayload && row.unit.enabled);
      if (only === 'filled' && !live) return false;
      if (only === 'empty' && live) return false;
      if (!needle) return true;
      return (
        row.placement.toLowerCase().includes(needle) ||
        row.page.toLowerCase().includes(needle) ||
        row.position.toLowerCase().includes(needle) ||
        (row.unit?.network ?? '').toLowerCase().includes(needle)
      );
    });
  }, [rows, query, only]);

  const groups = React.useMemo(() => {
    const map = new Map<string, InventoryRow[]>();
    for (const row of visible) {
      const list = map.get(row.page) ?? [];
      list.push(row);
      map.set(row.page, list);
    }
    return [...map.entries()];
  }, [visible]);

  const filled = rows.filter((r) => r.unit?.hasPayload && r.unit.enabled).length;

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      toast('The browser refused clipboard access. Select the id and copy it manually.', 'warning');
    }
  };

  const open = (row: InventoryRow) => {
    setEditing(row);
    setDraft(blankDraft(row));
    setError(null);
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/admin/ads/${draft.placement}`, {
        kind: draft.kind,
        ...(draft.html.trim() ? { html: draft.html.trim() } : {}),
        ...(draft.src.trim() ? { src: draft.src.trim() } : {}),
        ...(draft.containerId.trim() ? { containerId: draft.containerId.trim() } : {}),
        ...(draft.url.trim() ? { url: draft.url.trim() } : {}),
        ...(draft.network.trim() ? { network: draft.network.trim() } : {}),
        ...(draft.format ? { format: draft.format } : {}),
        enabled: draft.enabled,
        capPerSession: draft.capPerSession,
        geo: draft.geo
          .split(',')
          .map((g) => g.trim().toUpperCase())
          .filter((g) => g.length === 2),
      });
      toast('Unit saved. Live on the next page render.', 'success');
      setEditing(null);
      setDraft(null);
      router.refresh();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not save that unit.';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const clear = async (row: InventoryRow) => {
    setBusy(true);
    try {
      await api.del(`/api/admin/ads/${row.placement}`);
      toast(`${row.placement} emptied. The slot renders its placeholder again.`, 'success');
      setEditing(null);
      setDraft(null);
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not empty that slot.', 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-md border border-line bg-surface-1">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <div className="relative flex min-w-[220px] flex-1 items-center">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4 text-text-3" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by placement id, page or network"
            aria-label="Filter inventory"
            className="pl-9"
          />
        </div>
        <Select
          value={only}
          aria-label="Show"
          onChange={(e) => setOnly(e.target.value as 'all' | 'filled' | 'empty')}
        >
          <option value="all">Every slot</option>
          <option value="filled">Filled and enabled</option>
          <option value="empty">Empty or disabled</option>
        </Select>
        <span className="font-mono text-12 tabular text-text-3">
          {nf(filled)} / {nf(rows.length)} earning
        </span>
      </div>

      {groups.length === 0 ? (
        <p className="px-5 py-8 text-center text-13 text-text-3">No placement matches that filter.</p>
      ) : null}

      {groups.map(([page, items]) => (
        <div key={page}>
          <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-2 px-5 py-2">
            <h3 className="text-12 font-bold uppercase tracking-wide text-text-2">{page}</h3>
            <span className="font-mono text-11 tabular text-text-3">
              {nf(items.filter((i) => i.unit?.hasPayload && i.unit.enabled).length)} / {nf(items.length)}
            </span>
          </div>
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">{page} ad placements, their formats and their fill state</caption>
              <thead>
                <tr>
                  <th scope="col">Placement</th>
                  <th scope="col">Position</th>
                  <th scope="col">Format</th>
                  <th scope="col" className="th-num">
                    Desktop
                  </th>
                  <th scope="col" className="th-num">
                    Mobile
                  </th>
                  <th scope="col">State</th>
                  <th scope="col">Network</th>
                  <th scope="col">
                    <span className="sr-only">Edit</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const live = Boolean(row.unit?.hasPayload && row.unit.enabled);
                  const halfDone = Boolean(row.unit && !row.unit.hasPayload);
                  return (
                    <tr key={row.placement}>
                      <td>
                        <button
                          type="button"
                          onClick={() => copy(row.placement)}
                          className="inline-flex items-center gap-1.5 font-mono text-12 text-text hover:text-mint"
                          aria-label={`Copy placement id ${row.placement}`}
                        >
                          {row.placement}
                          {copied === row.placement ? (
                            <Check aria-hidden="true" className="size-3 text-mint" />
                          ) : (
                            <Copy aria-hidden="true" className="size-3 opacity-40" />
                          )}
                        </button>
                      </td>
                      <td className="text-text-3">{row.position}</td>
                      <td className="text-text-2">{AD_FORMATS[row.format].label}</td>
                      <td className="td-num tabular text-text-3">{formatDimensions(row.format)}</td>
                      <td className="td-num tabular text-text-3">{formatDimensions(row.mobileFormat)}</td>
                      <td>
                        {live ? (
                          <Pill tone="success">Filled</Pill>
                        ) : halfDone ? (
                          <Pill tone="warning">{row.unit?.enabled ? 'No payload' : 'Disabled'}</Pill>
                        ) : (
                          <Pill tone="neutral">Empty</Pill>
                        )}
                      </td>
                      <td className="text-text-3">{row.unit?.network ?? '—'}</td>
                      <td>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!canEdit}
                          onClick={() => open(row)}
                          title={canEdit ? undefined : 'Needs ads.edit'}
                        >
                          <Pencil aria-hidden="true" />
                          {live || halfDone ? 'Edit' : 'Fill'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {editing && draft ? (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={`${editing.page} — ${editing.position}`}
          description={`${editing.placement} · ${AD_FORMATS[editing.format].label} · ${formatDimensions(
            editing.format,
          )} desktop, ${formatDimensions(editing.mobileFormat)} mobile`}
          className="w-[min(720px,calc(100vw-32px))]"
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2">
              {editing.unit ? (
                <Button variant="danger" size="sm" disabled={busy} onClick={() => clear(editing)}>
                  <Trash2 aria-hidden="true" />
                  Empty this slot
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button variant="primary" disabled={busy} onClick={save}>
                  {busy ? 'Saving…' : 'Save unit'}
                </Button>
              </div>
            </div>
          }
        >
          <UnitForm draft={draft} row={editing} onChange={setDraft} error={error} />
        </Modal>
      ) : null}
    </section>
  );
}

function UnitForm({
  draft,
  row,
  onChange,
  error,
}: {
  draft: Draft;
  row: InventoryRow;
  onChange: (next: Draft) => void;
  error: string | null;
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => onChange({ ...draft, [key]: value });
  const guide = KIND_GUIDE[draft.kind];

  return (
    <div className="flex flex-col gap-4">
      {row.note ? <p className="text-12 leading-body text-text-3">{row.note}</p> : null}

      <Field>
        <Label htmlFor="unit-kind">Unit kind</Label>
        <Select
          id="unit-kind"
          value={draft.kind}
          onChange={(e) => set('kind', e.target.value as AdUnitKind)}
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_GUIDE[k].label}
            </option>
          ))}
        </Select>
        <Hint>{guide.blurb}</Hint>
      </Field>

      {draft.kind === 'html' ? (
        <Field>
          <Label htmlFor="unit-html">Network snippet</Label>
          <Textarea
            id="unit-html"
            value={draft.html}
            onChange={(e) => set('html', e.target.value)}
            placeholder={'<script type="text/javascript">\n  atOptions = { key: "…", format: "iframe", height: 90, width: 728, params: {} };\n</script>\n<script src="//www.highperformanceformat.com/…/invoke.js"></script>'}
            className="min-h-[184px] font-mono text-12"
            spellCheck={false}
          />
          <Hint>
            Pasted verbatim into a sandboxed iframe. Leave it exactly as the network gave it — reformatting
            an `atOptions` block is how a zone stops filling.
          </Hint>
        </Field>
      ) : null}

      {draft.kind === 'script' || draft.kind === 'container' ? (
        <Field>
          <Label htmlFor="unit-src">Loader URL</Label>
          <Input
            id="unit-src"
            mono
            value={draft.src}
            onChange={(e) => set('src', e.target.value)}
            placeholder="//pl00000000.profitablecpmgate.com/aa/bb/cc/aabbcc.js"
          />
          <Hint>Protocol-relative is fine. This is loaded as a script, not rendered as markup.</Hint>
        </Field>
      ) : null}

      {draft.kind === 'container' ? (
        <Field>
          <Label htmlFor="unit-container">Container div id</Label>
          <Input
            id="unit-container"
            mono
            value={draft.containerId}
            onChange={(e) => set('containerId', e.target.value)}
            placeholder="container-aabbccddeeff00112233445566778899"
          />
          <Hint>The exact id the loader looks for. A mismatch renders nothing and logs nothing.</Hint>
        </Field>
      ) : null}

      {draft.kind === 'url' ? (
        <Field>
          <Label htmlFor="unit-url">Destination URL</Label>
          <Input
            id="unit-url"
            mono
            value={draft.url}
            onChange={(e) => set('url', e.target.value)}
            placeholder="https://www.effectiveratecpm.com/…"
          />
          <Hint>Where the shortlink engine sends the visitor. Must be absolute.</Hint>
        </Field>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Field>
          <Label htmlFor="unit-network">Network label</Label>
          <Input
            id="unit-network"
            value={draft.network}
            onChange={(e) => set('network', e.target.value)}
            placeholder="Adsterra"
          />
          <Hint>Free text, for your own reporting. Not sent anywhere.</Hint>
        </Field>

        <Field>
          <Label htmlFor="unit-format">Format override</Label>
          <Select
            id="unit-format"
            value={draft.format}
            onChange={(e) => set('format', e.target.value as AdFormatId | '')}
          >
            <option value="">
              Placement default — {AD_FORMATS[row.format].label} ({formatDimensions(row.format)})
            </option>
            {AD_FORMAT_IDS.map((id) => (
              <option key={id} value={id}>
                {AD_FORMATS[id].label} · {formatDimensions(id)}
              </option>
            ))}
          </Select>
          <Hint>Only if the zone you bought is a different size from the box this slot reserves.</Hint>
        </Field>

        <Field>
          <Label htmlFor="unit-cap">Impression cap per session</Label>
          <Input
            id="unit-cap"
            mono
            type="number"
            min={0}
            value={draft.capPerSession}
            onChange={(e) => set('capPerSession', Number(e.target.value) || 0)}
          />
          <Hint>0 is unlimited. Use it on popunder and interstitial, not on display boxes.</Hint>
        </Field>

        <Field>
          <Label htmlFor="unit-geo">Country allowlist</Label>
          <Input
            id="unit-geo"
            mono
            value={draft.geo}
            onChange={(e) => set('geo', e.target.value)}
            placeholder="IN, NG, BR"
          />
          <Hint>Two-letter codes, comma separated. Empty serves everywhere.</Hint>
        </Field>
      </div>

      <label className="flex items-start justify-between gap-4">
        <span className="flex min-w-0 flex-col">
          <span className="text-13 font-semibold text-text-2">Enabled</span>
          <span className="text-11 text-text-3">
            Off blanks the slot without losing the tag, which is what you want while a zone is under review.
          </span>
        </span>
        <Switch
          checked={draft.enabled}
          onChange={(e) => set('enabled', e.target.checked)}
          aria-label="Unit enabled"
        />
      </label>

      <div className="rounded-sm border border-line bg-surface-2 p-3 text-12 leading-body text-text-3">
        <p>
          Resolution order is Firestore, then environment, then the committed fallback. To freeze this unit
          into a build instead, set{' '}
          <code className="font-mono text-11 text-text-2">{envKeyFor(row.placement)}</code> and leave the
          document empty.
        </p>
        {row.unit?.updatedAt ? (
          <p className="mt-1">
            Document last written <span className="font-mono tabular">{row.unit.updatedAt.slice(0, 16).replace('T', ' ')}</span> UTC.
          </p>
        ) : null}
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
