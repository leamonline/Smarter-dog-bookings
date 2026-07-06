// ============================================================
// src/components/dev/UiKitchenSink.jsx
//
// Dev-only catalogue for the shared UI primitives + design tokens.
// Renders every primitive × variant × state, the type scale, the
// loading/empty/error states, and sample charts — all on the real
// slate-50 staff canvas. Mounted on /dev/ui, gated by
// `import.meta.env.DEV` in the router so it never bundles into prod.
//
// This is the Milestone-1 review surface: eyeball it before the
// primitives roll out across the real pages.
// ============================================================

import { useState } from "react";
import { Plus, ArrowRight, Trash2, Check, Search, Pencil, X, MapPin, Bell } from "lucide-react";
import { SIZE_THEME } from "../../constants/index";
import { ModalShell, HeaderIconButton, OverflowMenu, PanelShell } from "../modals/shell/index.js";
import { WorkflowStatusStrip } from "../dashboard/WorkflowStatusStrip.jsx";
import {
  Button,
  Card,
  Badge,
  SectionLabel,
  EmptyState,
  Spinner,
  StatusPill,
  SizeDot,
  SizeTag,
  LoadingSpinner,
  ErrorBanner,
  InlineError,
  SkeletonBlock,
  SkeletonText,
  SkeletonCircle,
  CardGridSkeleton,
  ThreadSkeleton,
  SkeletonKpiRow,
  SkeletonChart,
} from "../ui/index.js";

function noop() {}

// Catalogue section wrapper (kept deliberately plain so it doesn't
// compete visually with the primitives being shown).
function Block({ title, hint, children }) {
  return (
    <section className="mb-14">
      <h2 className="text-sm font-bold text-slate-700 mb-1 uppercase tracking-wider">{title}</h2>
      {hint && <p className="text-body text-ink-muted mb-4">{hint}</p>}
      {!hint && <div className="mb-4" />}
      {children}
    </section>
  );
}

function Row({ children, className = "" }) {
  return <div className={`flex flex-wrap items-center gap-3 ${className}`}>{children}</div>;
}

// Small labelled wrapper so each specimen says what it is.
function Spec({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-micro text-ink-muted">{label}</span>
      {children}
    </div>
  );
}

const TYPE_STEPS = [
  ["text-display", "Display — 28px / KPI numerals", "font-display font-black"],
  ["text-title", "Title — 15px / card titles", "font-bold"],
  ["text-body", "Body — 13px / the workhorse", ""],
  ["text-caption", "Caption — 11px / pills, legends", ""],
  ["text-micro", "Micro — 10px / chart ticks, meta", ""],
];

const TONES = ["neutral", "info", "success", "warning", "danger", "brand"];
const STATES = ["ai_handling", "human_takeover", "snoozed", "closed"];

// ── Sample chart: daily revenue bars (mirrors WeeklyRevenueCard) ──
const REV = [
  { label: "Mon", pct: 92, amt: "£412" },
  { label: "Tue", pct: 64, amt: "£286" },
  { label: "Wed", pct: 38, amt: "£170" },
  { label: "Thu", pct: 78, amt: "£348" },
  { label: "Fri", pct: 100, amt: "£455" },
  { label: "Sat", pct: 21, amt: "£94" },
  { label: "Sun", pct: 0, amt: "£0" },
];
const revColour = (pct) =>
  pct >= 90 ? "bg-emerald-500" : pct >= 50 ? "bg-brand-teal" : pct > 0 ? "bg-amber-400" : "bg-slate-200";

function TrendMini() {
  const max = Math.max(...REV.map((d) => d.pct));
  return (
    <div className="relative pl-9">
      {/* Y-axis ticks */}
      <div className="absolute left-0 top-0 bottom-6 w-8 flex flex-col justify-between text-micro text-ink-muted text-right pr-1">
        <span>£455</span>
        <span>£228</span>
        <span>£0</span>
      </div>
      {/* Guide lines + bars */}
      <div className="relative flex items-end gap-1.5 h-36 border-l border-b border-slate-200/70">
        <div className="absolute inset-x-0 top-0 border-t border-slate-200/70" aria-hidden="true" />
        <div className="absolute inset-x-0 top-1/2 border-t border-slate-200/70" aria-hidden="true" />
        {REV.map((d) => (
          <div
            key={d.label}
            tabIndex={0}
            className="group relative flex-1 flex items-end h-full rounded-t outline-none focus-visible:ring-2 focus-visible:ring-brand-yellow"
            aria-label={`${d.label}: ${d.amt}`}
          >
            <div
              className="w-full rounded-t bg-brand-teal/80 group-hover:bg-brand-teal group-focus:bg-brand-teal motion-safe:transition-[height,background-color]"
              style={{ height: `${max ? (d.pct / max) * 100 : 0}%` }}
            />
            <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800 text-white text-micro font-semibold px-2 py-1 opacity-0 group-hover:opacity-100 group-focus:opacity-100 motion-safe:transition-opacity">
              {d.amt}
            </div>
          </div>
        ))}
      </div>
      {/* X labels */}
      <div className="flex gap-1.5 mt-1">
        {REV.map((d) => (
          <span key={d.label} className="flex-1 text-center text-micro text-ink-muted">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// Specimen header matching the entity-modal header anatomy (eyebrow,
// display name, subtitle row, icon cluster) for shell review.
function ShellSpecimenHeader({ onClose }) {
  return (
    <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div
          aria-hidden="true"
          className="w-[46px] h-[46px] rounded-full bg-[#E6F5F2] flex items-center justify-center font-display font-bold text-brand-purple shrink-0"
        >
          ST
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-label text-ink-muted">
            Specimen profile
          </span>
          <h2
            id="shell-specimen-title"
            className="text-xl font-bold font-display text-brand-purple leading-tight mt-0.5 truncate"
          >
            Sample Human
          </h2>
          <div className="text-[13px] text-slate-500 font-semibold mt-1">07712 345 678</div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <HeaderIconButton label="Edit profile">
          <Pencil size={14} strokeWidth={2.2} aria-hidden="true" />
        </HeaderIconButton>
        <OverflowMenu items={[{ label: "Archive…", onClick: noop }, { label: "Merge…", onClick: noop }]} />
        <HeaderIconButton label="Close" onClick={onClose}>
          <X size={16} strokeWidth={2.2} aria-hidden="true" />
        </HeaderIconButton>
      </div>
    </header>
  );
}

function ShellSpecimenPanels() {
  return (
    <div className="flex flex-col gap-3">
      <PanelShell eyebrow="Contact" icon={MapPin} accent="teal">
        <p className="text-body text-slate-700">12 Sample Street, Stockport SK4 2AB</p>
        <p className="text-body text-slate-700 mt-1">sample@example.com</p>
      </PanelShell>
      <PanelShell eyebrow="Reminders" icon={Bell} accent="amber">
        <p className="text-body text-slate-700">WhatsApp · 24h before</p>
      </PanelShell>
      <PanelShell eyebrow="Scroll filler" accent="slate">
        {Array.from({ length: 12 }, (_, i) => (
          <p key={i} className="text-body text-slate-500 py-1.5 border-b border-slate-100 last:border-b-0">
            Filler row {i + 1} — checks the body scrolls under the pinned header/footer.
          </p>
        ))}
      </PanelShell>
    </div>
  );
}

export function UiKitchenSink() {
  const [loading, setLoading] = useState(false);
  const [shellOpen, setShellOpen] = useState(false);
  const [shellFooterOpen, setShellFooterOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <header className="mb-12">
          <h1 className="text-3xl font-black font-display text-brand-purple">UI kitchen sink</h1>
          <p className="text-body text-ink-muted mt-1">
            Design tokens + primitives, on the real slate-50 canvas.{" "}
            <span className="font-semibold">Dev-only</span> — not bundled into production.
          </p>
        </header>

        {/* ── Type scale ───────────────────────────────────────── */}
        <Block title="Type scale" hint="Named steps replace the text-[9–15px] one-offs. 12/14/16px keep Tailwind defaults.">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card-resting p-6 flex flex-col gap-3">
            {TYPE_STEPS.map(([cls, label, extra]) => (
              <div key={cls} className="flex items-baseline gap-4">
                <code className="text-micro text-ink-muted w-28 shrink-0">{cls}</code>
                <span className={`${cls} ${extra} text-slate-800`}>{label}</span>
              </div>
            ))}
            <hr className="border-slate-100 my-1" />
            <div className="flex items-center gap-4">
              <code className="text-micro text-ink-muted w-28 shrink-0">text-label</code>
              <SectionLabel>Section label kicker</SectionLabel>
            </div>
          </div>
        </Block>

        {/* ── Ink + muted ─────────────────────────────────────── */}
        <Block title="Ink colours" hint="text-ink (= brand purple) and text-ink-muted (slate-500, ≈4.76:1 — passes AA where the old slate-400 failed).">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card-resting p-6 flex flex-col gap-2">
            <p className="text-ink text-sm font-semibold">text-ink — primary text, headings, links</p>
            <p className="text-ink-muted text-sm">text-ink-muted — captions, owner lines, footnotes (accessible)</p>
            <p className="text-slate-400 text-sm">text-slate-400 — decoration only now (icons, separators)</p>
          </div>
        </Block>

        {/* ── Buttons ─────────────────────────────────────────── */}
        <Block title="Button" hint="primary / danger / ghost / link · sizes sm + md · loading, icons, disabled, full-width.">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card-resting p-6 flex flex-col gap-6">
            <Spec label="variants (md)">
              <Row>
                <Button variant="primary">Book this seat</Button>
                <Button variant="danger" iconLeft={<Trash2 size={15} strokeWidth={2.4} />}>Remove</Button>
                <Button variant="ghost" iconLeft={<Plus size={15} strokeWidth={2.4} />}>Add dog</Button>
                <Button variant="link">Forgot password?</Button>
              </Row>
            </Spec>
            <Spec label="sizes">
              <Row>
                <Button size="sm" variant="primary">Small</Button>
                <Button size="md" variant="primary">Medium</Button>
                <Button size="sm" variant="ghost">Small ghost</Button>
              </Row>
            </Spec>
            <Spec label="states">
              <Row>
                <Button variant="primary" disabled>Disabled</Button>
                <Button variant="primary" loading>Saving…</Button>
                <Button
                  variant="ghost"
                  loading={loading}
                  onClick={() => {
                    setLoading(true);
                    setTimeout(() => setLoading(false), 1600);
                  }}
                >
                  Click to load
                </Button>
                <Button variant="primary" iconRight={<ArrowRight size={15} strokeWidth={2.4} />}>Next</Button>
                <Button variant="ghost" aria-label="Search" iconLeft={<Search size={15} strokeWidth={2.4} />} />
              </Row>
            </Spec>
            <Spec label="full width">
              <Button variant="primary" fullWidth iconLeft={<Check size={16} strokeWidth={2.4} />}>
                Confirm booking
              </Button>
            </Spec>
          </div>
        </Block>

        {/* ── Cards ───────────────────────────────────────────── */}
        <Block title="Card" hint="padding none/compact/default · resting + interactive · gradient top-accent stripe (size gradients).">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <SectionLabel className="mb-1">Default padding</SectionLabel>
              <p className="text-body text-slate-700">Resting white card, p-5, slate-200 border.</p>
            </Card>
            <Card padding="compact">
              <SectionLabel className="mb-1">Compact padding</SectionLabel>
              <p className="text-body text-slate-700">Same card at p-4.</p>
            </Card>
            <Card
              as="button"
              interactive
              accent={{ from: SIZE_THEME.small.gradient[0], to: SIZE_THEME.small.gradient[1] }}
              onClick={noop}
            >
              <SectionLabel className="mb-1">Interactive · small</SectionLabel>
              <p className="text-body text-slate-700">Hover to lift; Tab for focus ring.</p>
            </Card>
            <Card
              as="button"
              interactive
              accent={{ from: SIZE_THEME.medium.gradient[0], to: SIZE_THEME.medium.gradient[1] }}
              onClick={noop}
            >
              <SectionLabel className="mb-1">Interactive · medium</SectionLabel>
              <p className="text-body text-slate-700">Teal gradient accent.</p>
            </Card>
            <Card
              as="button"
              interactive
              accent={{ from: SIZE_THEME.large.gradient[0], to: SIZE_THEME.large.gradient[1] }}
              onClick={noop}
            >
              <SectionLabel className="mb-1">Interactive · large</SectionLabel>
              <p className="text-body text-slate-700">Coral gradient accent.</p>
            </Card>
            <Card accent="var(--color-brand-cyan)">
              <SectionLabel className="mb-1">Custom accent</SectionLabel>
              <p className="text-body text-slate-700">Single-colour accent fades out.</p>
            </Card>
          </div>
        </Block>

        {/* ── Badges ──────────────────────────────────────────── */}
        <Block title="Badge" hint="Generic chips. tone × variant (soft / solid / outline) × size.">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card-resting p-6 flex flex-col gap-5">
            {["soft", "solid", "outline"].map((variant) => (
              <Spec key={variant} label={variant}>
                <Row>
                  {TONES.map((tone) => (
                    <Badge key={tone} tone={tone} variant={variant}>
                      {tone}
                    </Badge>
                  ))}
                </Row>
              </Spec>
            ))}
            <Spec label="sizes + uppercase">
              <Row>
                <Badge size="xs" tone="danger">3</Badge>
                <Badge size="sm" tone="success">WA</Badge>
                <Badge size="sm" tone="warning" uppercase>Incomplete</Badge>
              </Row>
            </Spec>
          </div>
        </Block>

        {/* ── StatusPill ──────────────────────────────────────── */}
        <Block title="StatusPill" hint="Semantic conversation states (shared from the inbox).">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card-resting p-6 flex flex-col gap-4">
            <Spec label="sm">
              <Row>{STATES.map((s) => <StatusPill key={s} state={s} />)}</Row>
            </Spec>
            <Spec label="xs">
              <Row>{STATES.map((s) => <StatusPill key={s} state={s} size="xs" />)}</Row>
            </Spec>
          </div>
        </Block>

        {/* ── Size dots ───────────────────────────────────────── */}
        <Block title="SizeDot / SizeTag" hint="Colour + letter (colour-blind safe). small=yellow, medium=green, large=pink.">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card-resting p-6 flex flex-col gap-4">
            <Spec label="SizeDot (with letter)">
              <Row>
                <SizeDot size="small" />
                <SizeDot size="medium" />
                <SizeDot size="large" />
                <SizeDot size={null} />
                <SizeDot size="large" dim={24} />
              </Row>
            </Spec>
            <Spec label="SizeTag (gradient, legend/header)">
              <Row>
                <SizeTag size="small" />
                <SizeTag size="medium" legendMode />
                <SizeTag size="large" headerMode />
              </Row>
            </Spec>
          </div>
        </Block>

        {/* ── SectionLabel ────────────────────────────────────── */}
        <Block title="SectionLabel" hint="Render as h2/h3 when it introduces a region; div for decoration.">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card-resting p-6 flex flex-col gap-2">
            <SectionLabel as="h2">Heading two</SectionLabel>
            <SectionLabel as="h3">Heading three</SectionLabel>
            <SectionLabel>Decorative kicker</SectionLabel>
          </div>
        </Block>

        {/* ── Skeletons ───────────────────────────────────────── */}
        <Block title="Skeletons" hint="Shaped placeholders that mirror the final layout.">
          <div className="flex flex-col gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-card-resting p-6 flex flex-col gap-4">
              <Spec label="Block / Text / Circle">
                <div className="flex items-center gap-6">
                  <SkeletonCircle size={48} />
                  <div className="flex-1"><SkeletonText lines={3} /></div>
                  <SkeletonBlock className="h-8 w-24 rounded-md" />
                </div>
              </Spec>
            </div>
            <Spec label="SkeletonKpiRow"><SkeletonKpiRow /></Spec>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Spec label="SkeletonChart"><SkeletonChart /></Spec>
              <Spec label="ThreadSkeleton">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-card-resting"><ThreadSkeleton bubbles={4} /></div>
              </Spec>
            </div>
            <Spec label="CardGridSkeleton (1 row)"><CardGridSkeleton rows={1} cols={3} /></Spec>
          </div>
        </Block>

        {/* ── Empty states ────────────────────────────────────── */}
        <Block title="EmptyState" hint="Unified empties. sm for in-card, md for full-grid.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card padding="none">
              <EmptyState size="sm" icon="🐾" title="No dogs booked" description="Nothing on the books for this day yet." />
            </Card>
            <Card padding="none">
              <EmptyState
                size="md"
                icon="📭"
                title="Your inbox is clear"
                description="New customer messages will land here."
                action={<Button variant="primary" size="sm" iconLeft={<Plus size={14} strokeWidth={2.4} />}>New booking</Button>}
              />
            </Card>
          </div>
        </Block>

        {/* ── Spinners ────────────────────────────────────────── */}
        <Block title="Spinner" hint="Inline (currentColor) + the full-page LoadingSpinner.">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card-resting p-6 flex flex-col gap-5">
            <Spec label="inline sizes (adapt to text colour)">
              <Row className="text-brand-teal">
                <Spinner size="sm" />
                <Spinner size="md" />
                <Spinner size="lg" />
                <span className="text-brand-coral"><Spinner size="md" /></span>
              </Row>
            </Spec>
            <Spec label="LoadingSpinner (route fallback)">
              <div className="border border-dashed border-slate-200 rounded-xl"><LoadingSpinner /></div>
            </Spec>
          </div>
        </Block>

        {/* ── Feedback ────────────────────────────────────────── */}
        <Block title="Error feedback" hint="ErrorBanner (page/card) + InlineError (in-form).">
          <div className="flex flex-col gap-4">
            <ErrorBanner title="Couldn't load reports right now" message="The booking data didn't come through. Refresh to try again." retry={noop} />
            <ErrorBanner title="Heads up" message="With a dismiss button." onClose={noop} />
            <div className="bg-white rounded-2xl border border-slate-200 shadow-card-resting p-6 max-w-sm">
              <label className="text-body font-semibold text-slate-700">Email</label>
              <input className="mt-1 w-full rounded-control border border-slate-200 px-3 py-2 text-sm" defaultValue="not-an-email" />
              <InlineError message="Please enter a valid email address." />
            </div>
          </div>
        </Block>

        {/* ── Sample charts ───────────────────────────────────── */}
        <Block title="Sample charts" hint="Hand-rolled, teal/green palette kept. Polished axis/label/tooltip treatment for Reports.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <SectionLabel className="mb-3">Daily revenue</SectionLabel>
              <div className="flex flex-col gap-2.5">
                {REV.map((d) => (
                  <div key={d.label} className="flex items-center gap-3">
                    <span className="text-micro text-ink-muted w-8 shrink-0">{d.label}</span>
                    <div className="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full rounded-full ${revColour(d.pct)} motion-safe:transition-all`} style={{ width: `${Math.max(2, d.pct)}%` }} />
                    </div>
                    <span className="text-caption font-semibold text-slate-700 tabular-nums w-12 text-right">{d.amt}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <SectionLabel className="mb-3">Revenue trend (hover / focus a bar)</SectionLabel>
              <TrendMini />
            </Card>
          </div>
        </Block>

        {/* ── Workflow status strip ───────────────────────────── */}
        <Block
          title="WorkflowStatusStrip (mobile)"
          hint="Below xl, the workflow panels live here — above the schedule. Collapsed it surfaces the pending counts; click to expand the full tabs. Shown at a phone column width."
        >
          <div className="max-w-sm flex flex-col gap-6">
            <Spec label="pending items">
              <WorkflowStatusStrip
                failures={{ count: 0, failures: [] }}
                messageCount={3}
                reminderCount={5}
                waitlistCount={1}
                todoCount={2}
                reminderData={{ targetDate: null, rows: [], sentCount: 0, totalCount: 0, loading: false }}
                onOpenWaitlist={noop}
                onOpenTodos={noop}
                onCreateBookingFromWhatsApp={noop}
              />
            </Spec>
            <Spec label="all clear">
              <WorkflowStatusStrip
                failures={{ count: 0, failures: [] }}
                reminderData={{ targetDate: null, rows: [], sentCount: 0, totalCount: 0, loading: false }}
                onOpenWaitlist={noop}
                onOpenTodos={noop}
                onCreateBookingFromWhatsApp={noop}
              />
            </Spec>
          </div>
        </Block>

        {/* ── Modal shell ─────────────────────────────────────── */}
        <Block
          title="Modal shell"
          hint="Entity-modal chrome: accent bar + quiet header + paper body + PanelShell panels. Below sm (640px) it becomes a full-screen slide-up sheet — resize to test."
        >
          <Row>
            <Button variant="ghost" onClick={() => setShellOpen(true)}>Open shell</Button>
            <Button variant="ghost" onClick={() => setShellFooterOpen(true)}>
              Open shell with sticky footer
            </Button>
          </Row>
        </Block>

        {shellOpen && (
          <ModalShell
            onClose={() => setShellOpen(false)}
            titleId="shell-specimen-title"
            accent="#2D8B7A"
            widthClass="w-[min(560px,95vw)]"
            header={<ShellSpecimenHeader onClose={() => setShellOpen(false)} />}
            bodyClassName="px-5 pb-4"
          >
            <ShellSpecimenPanels />
          </ModalShell>
        )}

        {shellFooterOpen && (
          <ModalShell
            onClose={() => setShellFooterOpen(false)}
            titleId="shell-specimen-title"
            accent="var(--color-brand-coral)"
            widthClass="w-[min(560px,95vw)]"
            header={<ShellSpecimenHeader onClose={() => setShellFooterOpen(false)} />}
            bodyClassName="px-5 pb-4"
            footer={
              <div className="flex items-center justify-end gap-2 px-5 py-3 bg-white border-t border-slate-200">
                <Button variant="ghost" onClick={() => setShellFooterOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={() => setShellFooterOpen(false)}>Save changes</Button>
              </div>
            }
          >
            <ShellSpecimenPanels />
          </ModalShell>
        )}
      </div>
    </div>
  );
}
