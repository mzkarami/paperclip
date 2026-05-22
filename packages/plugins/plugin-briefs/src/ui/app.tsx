import {
  useHostNavigation,
  usePluginAction,
  usePluginData,
  usePluginToast,
  type PluginPageProps,
  type PluginSidebarProps,
} from "@paperclipai/plugin-sdk/ui";
import {
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type {
  BriefCard,
  BriefCardSource,
  BriefCardState,
  BriefPreferences,
  BriefSummaryStatus,
  BriefTaskRow,
} from "../contracts.js";
import {
  countAttention,
  formatRelative,
  groupCardsIntoSections,
  rightTagForRow,
  shouldDimCard,
  stateBadgeLabel,
  stateTone,
  summaryFallbackLabel,
  truncateTitle,
  type BriefSection,
  type BriefSectionKey,
} from "./view-model.js";

const fontStack = `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

const tokens = {
  bg: "var(--background, oklch(0.145 0 0))",
  card: "var(--card, oklch(0.205 0 0))",
  border: "var(--border, oklch(0.269 0 0))",
  fg: "var(--foreground, oklch(0.985 0 0))",
  muted: "var(--muted-foreground, oklch(0.708 0 0))",
  accent: "var(--accent, oklch(0.269 0 0))",
  primary: "var(--primary, oklch(0.985 0 0))",
};

const toneColors: Record<"red" | "warning" | "violet" | "cyan" | "green" | "muted", { accent: string; badgeBg: string; badgeFg: string }> = {
  red: { accent: "oklch(0.62 0.21 25)", badgeBg: "oklch(0.27 0.09 25)", badgeFg: "oklch(0.85 0.14 25)" },
  warning: { accent: "oklch(0.72 0.15 70)", badgeBg: "oklch(0.27 0.07 70)", badgeFg: "oklch(0.85 0.11 70)" },
  violet: { accent: "oklch(0.62 0.18 305)", badgeBg: "oklch(0.27 0.07 305)", badgeFg: "oklch(0.84 0.11 305)" },
  cyan: { accent: "oklch(0.7 0.13 200)", badgeBg: "oklch(0.27 0.06 200)", badgeFg: "oklch(0.84 0.11 200)" },
  green: { accent: "oklch(0.65 0.16 145)", badgeBg: "oklch(0.27 0.06 145)", badgeFg: "oklch(0.84 0.1 145)" },
  muted: { accent: "oklch(0.5 0 0)", badgeBg: "oklch(0.25 0 0)", badgeFg: "oklch(0.75 0 0)" },
};

const sourceKindIcon: Record<BriefCardSource["sourceKind"], string> = {
  issue: "■",
  issue_tree: "◰",
  comment: "❝",
  run: "▷",
  document: "▤",
  work_product: "✱",
  interaction: "?",
  activity_event: "•",
  approval: "✓",
};

type PageData = {
  cards: BriefCard[];
  preferences: BriefPreferences;
  fetchedAt: string;
};

const SECTION_TABS: Array<{ key: BriefSectionKey | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "attention", label: "Needs you" },
  { key: "live", label: "Live" },
  { key: "settled", label: "Done" },
];

export function SidebarLink({ context }: PluginSidebarProps) {
  const nav = useHostNavigation();
  const params = useMemo(() => ({ companyId: context.companyId ?? "", userId: context.userId ?? "" }), [context.companyId, context.userId]);
  const enabled = Boolean(params.companyId && params.userId);
  const { data } = usePluginData<{ cards: BriefCard[] }>("cards", enabled ? params : undefined);

  const cards = data?.cards ?? [];
  const count = useMemo(() => countAttention(cards), [cards]);

  const link = nav.linkProps("/briefs");
  return (
    <a
      {...link}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 6,
        color: tokens.fg,
        textDecoration: "none",
        fontSize: 13,
        fontFamily: fontStack,
      }}
    >
      <span aria-hidden style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, background: toneColors.cyan.accent }} />
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>Briefing</span>
      {count > 0 ? <AttentionBadge count={count} /> : null}
    </a>
  );
}

function AttentionBadge({ count }: { count: number }) {
  return (
    <span
      aria-label={`${count} brief${count === 1 ? "" : "s"} need your attention`}
      style={{
        minWidth: 18,
        padding: "0 6px",
        height: 18,
        borderRadius: 9,
        background: toneColors.warning.badgeBg,
        color: toneColors.warning.badgeFg,
        fontSize: 11,
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function BriefingPage({ context }: PluginPageProps) {
  const params = useMemo(() => ({ companyId: context.companyId ?? "", userId: context.userId ?? "" }), [context.companyId, context.userId]);
  const enabled = Boolean(params.companyId && params.userId);
  const { data, loading, error, refresh } = usePluginData<PageData>("page", enabled ? params : undefined);

  if (!enabled) {
    return (
      <PageShell>
        <EmptyState
          title="Sign in to see your briefing"
          body="The Briefing page is scoped to the signed-in user and company."
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      meta={data ? <PageMeta data={data} /> : null}
      action={<RefreshButton onClick={refresh} loading={loading} />}
      preferences={data ? <PreferencesControl preferences={data.preferences} onChanged={refresh} /> : null}
    >
      {error ? (
        <ErrorPanel message={error.message} onRetry={refresh} />
      ) : loading && !data ? (
        <LoadingState />
      ) : data && data.cards.length === 0 ? (
        <EmptyState
          title="No briefs yet"
          body="Cards appear here once the Briefing Analyst picks up recent work. Pinned cards never expire."
        />
      ) : data ? (
        <PageBody data={data} onChanged={refresh} />
      ) : null}
    </PageShell>
  );
}

function PageShell({ children, meta, action, preferences }: {
  children: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  preferences?: ReactNode;
}) {
  return (
    <div style={{ fontFamily: fontStack, color: tokens.fg, padding: "20px clamp(12px, 4vw, 32px)", maxWidth: 1280, margin: "0 auto", minHeight: "100vh" }}>
      <header data-briefs-page-header style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: -0.2 }}>Briefing</h1>
        <div data-briefs-page-meta style={{ flex: 1, minWidth: 0, fontSize: 12, color: tokens.muted, overflow: "hidden", textOverflow: "ellipsis" }}>{meta}</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {preferences}
          {action}
        </div>
      </header>
      <p style={{ margin: 0, marginBottom: 18, fontSize: 13, color: tokens.muted }}>
        Durable cards for areas of work that involve you. Pin the ones you always want to see.
      </p>
      {children}
    </div>
  );
}

function PageMeta({ data }: { data: PageData }) {
  const active = data.cards.filter((c) => !c.hidden);
  const pinned = active.filter((c) => c.pinned).length;
  return (
    <span>
      {active.length} active · {pinned} pinned · refreshed {formatRelative(data.fetchedAt)}
    </span>
  );
}

function RefreshButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      style={{
        padding: "6px 10px",
        borderRadius: 6,
        border: `1px solid ${tokens.border}`,
        background: tokens.card,
        color: tokens.fg,
        fontSize: 12,
        cursor: loading ? "wait" : "pointer",
        fontFamily: fontStack,
      }}
    >
      {loading ? "Refreshing…" : "Refresh"}
    </button>
  );
}

function PreferencesControl({ preferences, onChanged }: { preferences: BriefPreferences; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const update = usePluginAction("update-preferences");
  const toast = usePluginToast();
  const [local, setLocal] = useState(preferences);

  const save = useCallback(async (next: BriefPreferences) => {
    try {
      await update(next);
      onChanged();
      toast({ tone: "success", title: "Preferences saved" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save preferences";
      toast({ tone: "error", title: "Save failed", body: message });
    }
  }, [update, toast, onChanged]);

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          padding: "6px 10px",
          borderRadius: 6,
          border: `1px solid ${tokens.border}`,
          background: tokens.card,
          color: tokens.fg,
          fontSize: 12,
          cursor: "pointer",
          fontFamily: fontStack,
        }}
      >
        Preferences
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Briefing preferences"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 6px)",
            zIndex: 30,
            background: tokens.card,
            border: `1px solid ${tokens.border}`,
            borderRadius: 8,
            padding: 12,
            width: 280,
            boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
          }}
        >
          <PreferenceRow
            label="Cadence"
            value={local.cadence}
            options={[{ value: "manual", label: "Manual only" }, { value: "hourly", label: "Hourly" }, { value: "daily", label: "Daily" }]}
            onChange={(value) => setLocal((p) => ({ ...p, cadence: value as BriefPreferences["cadence"] }))}
          />
          <PreferenceNumber
            label="Retention (days)"
            value={local.retentionDays}
            min={1}
            max={90}
            onChange={(value) => setLocal((p) => ({ ...p, retentionDays: value }))}
          />
          <PreferenceNumber
            label="Done retention (hours)"
            value={local.doneRetentionHours}
            min={1}
            max={168}
            onChange={(value) => setLocal((p) => ({ ...p, doneRetentionHours: value }))}
          />
          <PreferenceNumber
            label="Stale after (days)"
            value={local.staleAfterDays}
            min={1}
            max={30}
            onChange={(value) => setLocal((p) => ({ ...p, staleAfterDays: value }))}
          />
          <PreferenceNumber
            label="Max unpinned cards"
            value={local.maxUnpinnedCards}
            min={1}
            max={100}
            onChange={(value) => setLocal((p) => ({ ...p, maxUnpinnedCards: value }))}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 8 }}>
            <button
              type="button"
              onClick={() => { setLocal(preferences); setOpen(false); }}
              style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${tokens.border}`, background: "transparent", color: tokens.muted, fontSize: 12, cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => { void save(local).then(() => setOpen(false)); }}
              style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid transparent", background: tokens.primary, color: "var(--primary-foreground, oklch(0.205 0 0))", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              Save
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PreferenceRow({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (next: string) => void;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, marginBottom: 8 }}>
      <span style={{ color: tokens.muted }}>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{ background: tokens.bg, border: `1px solid ${tokens.border}`, color: tokens.fg, borderRadius: 6, padding: "5px 8px", fontSize: 12 }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </label>
  );
}

function PreferenceNumber({ label, value, min, max, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, marginBottom: 8 }}>
      <span style={{ color: tokens.muted }}>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => {
          const next = Number.parseInt(event.target.value, 10);
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
        }}
        style={{ background: tokens.bg, border: `1px solid ${tokens.border}`, color: tokens.fg, borderRadius: 6, padding: "5px 8px", fontSize: 12 }}
      />
    </label>
  );
}

function PageBody({ data, onChanged }: { data: PageData; onChanged: () => void }) {
  const sections = useMemo(() => groupCardsIntoSections(data.cards), [data.cards]);
  const [activeTab, setActiveTab] = useState<BriefSectionKey | "all">(() => (sections.find((s) => s.key === "attention" && s.cards.length > 0) ? "attention" : "all"));

  return (
    <>
      <MobileTabs sections={sections} active={activeTab} onChange={setActiveTab} />
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {sections.map((section) => (
          <SectionView
            key={section.key}
            section={section}
            visibleOnMobile={activeTab === "all" || activeTab === section.key}
            onChanged={onChanged}
          />
        ))}
      </div>
      <Legend />
    </>
  );
}

function MobileTabs({ sections, active, onChange }: {
  sections: BriefSection[];
  active: BriefSectionKey | "all";
  onChange: (next: BriefSectionKey | "all") => void;
}) {
  const counts = useMemo(() => {
    const map: Record<string, number> = { all: 0 };
    for (const section of sections) {
      map[section.key] = section.cards.length;
      map.all += section.cards.length;
    }
    return map;
  }, [sections]);

  return (
    <nav
      aria-label="Briefing sections"
      data-briefs-mobile-tabs
      style={{
        display: "none",
        position: "sticky",
        top: 0,
        zIndex: 5,
        background: tokens.bg,
        gap: 6,
        padding: "8px 0",
        margin: "0 0 8px",
        borderBottom: `1px solid ${tokens.border}`,
      }}
    >
      {SECTION_TABS.map((tab) => {
        const count = counts[tab.key] ?? 0;
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            aria-pressed={isActive}
            style={{
              flex: 1,
              padding: "8px 6px",
              borderRadius: 6,
              border: `1px solid ${isActive ? tokens.fg : tokens.border}`,
              background: isActive ? "var(--secondary, oklch(0.269 0 0))" : "transparent",
              color: isActive ? tokens.fg : tokens.muted,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <span>{tab.label}</span>
            {count > 0 ? <span style={{ marginLeft: 4, color: tokens.muted, fontWeight: 400 }}>{count}</span> : null}
          </button>
        );
      })}
    </nav>
  );
}

function SectionView({ section, visibleOnMobile, onChanged }: { section: BriefSection; visibleOnMobile: boolean; onChanged: () => void }) {
  if (section.cards.length === 0) return null;
  return (
    <section
      data-briefs-section={section.key}
      data-mobile-hidden={visibleOnMobile ? undefined : "true"}
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 12, letterSpacing: 0.6, color: tokens.muted, textTransform: "uppercase", fontWeight: 600 }}>
          {section.label}
        </h2>
        <span style={{ fontSize: 12, color: tokens.muted }}>{section.cards.length}</span>
        <span style={{ flex: 1, borderBottom: `1px dashed ${tokens.border}` }} />
      </header>
      <div
        data-briefs-grid
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 360px), 1fr))",
          gap: 12,
        }}
      >
        {section.cards.map((card) => (
          <BriefCardView key={card.id} card={card} onChanged={onChanged} />
        ))}
      </div>
    </section>
  );
}

export function BriefCardView({ card, onChanged }: { card: BriefCard; onChanged: () => void }) {
  const nav = useHostNavigation();
  const pin = usePluginAction("pin-card");
  const toast = usePluginToast();
  const tone = toneColors[stateTone[card.state]];
  const dim = shouldDimCard(card);
  const taskRows = card.snapshot.taskRows;
  const openHref = primaryOpenHref(card);

  const togglePin = useCallback(async () => {
    try {
      await pin({ companyId: card.companyId, userId: card.userId, cardId: card.id, pinned: !card.pinned });
      onChanged();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not update pin";
      toast({ tone: "error", title: "Pin failed", body: message });
    }
  }, [pin, card, onChanged, toast]);

  return (
    <article
      data-briefs-card
      data-state={card.state}
      data-summary-status={card.snapshot.summaryStatus}
      data-pinned={card.pinned ? "true" : "false"}
      style={{
        position: "relative",
        background: tokens.card,
        border: `1px solid ${tokens.border}`,
        borderRadius: 10,
        padding: "12px 14px 12px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minWidth: 0,
        opacity: dim ? 0.78 : 1,
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 8,
          bottom: 8,
          left: 6,
          width: 3,
          borderRadius: 2,
          background: tone.accent,
        }}
      />
      <header style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
        <PinButton pinned={card.pinned} onToggle={togglePin} />
        <h3 style={{ margin: 0, flex: 1, fontSize: 14, fontWeight: 600, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {truncateTitle(card.title, 70)}
        </h3>
        <StateBadge state={card.state} />
      </header>
      <MetaRow card={card} />
      <SummarySlot card={card} onRetry={onChanged} />
      <SourceRows rows={taskRows} />
      <Footer card={card} openHref={openHref} nav={nav} />
    </article>
  );
}

function PinButton({ pinned, onToggle }: { pinned: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={pinned}
      aria-label={pinned ? "Unpin card" : "Pin card"}
      style={{
        width: 22,
        height: 22,
        flexShrink: 0,
        borderRadius: 6,
        border: `1px solid ${pinned ? "oklch(0.8 0.13 80)" : tokens.border}`,
        background: pinned ? "oklch(0.4 0.13 80)" : "transparent",
        color: pinned ? "oklch(0.95 0.1 80)" : tokens.muted,
        fontSize: 12,
        lineHeight: 1,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {pinned ? "★" : "☆"}
    </button>
  );
}

function StateBadge({ state }: { state: BriefCardState }) {
  const tone = toneColors[stateTone[state]];
  return (
    <span
      data-briefs-state-badge={state}
      style={{
        flexShrink: 0,
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 600,
        borderRadius: 999,
        background: tone.badgeBg,
        color: tone.badgeFg,
        whiteSpace: "nowrap",
      }}
    >
      {stateBadgeLabel[state]}
    </span>
  );
}

function MetaRow({ card }: { card: BriefCard }) {
  const identifiers = collectIdentifiers(card);
  const issueCount = uniqueIssueCount(card);
  const agentCount = uniqueAgentCount(card);
  const stamp = formatRelative(card.lastMeaningfulEventAt);
  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, fontSize: 11, color: tokens.muted, minWidth: 0 }}>
      {identifiers.length > 0 ? (
        <span style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace", color: tokens.fg }}>{identifiers[0]}</span>
      ) : null}
      {issueCount > 0 ? <span>{issueCount} {issueCount === 1 ? "issue" : "issues"}</span> : null}
      {agentCount > 0 ? <span>{agentCount} {agentCount === 1 ? "agent" : "agents"}</span> : null}
      {stamp ? <span>· {stamp}</span> : null}
    </div>
  );
}

function SummarySlot({ card, onRetry }: { card: BriefCard; onRetry: () => void }) {
  const status: BriefSummaryStatus = card.snapshot.summaryStatus;
  if (status === "ok") {
    return (
      <p
        data-briefs-summary
        style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: tokens.fg, overflow: "hidden", display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 3 }}
      >
        {card.snapshot.summaryParagraph || derivedSynopsis(card)}
      </p>
    );
  }
  if (status === "pending") {
    return (
      <div data-briefs-summary-pending style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ height: 10, background: "var(--secondary, oklch(0.27 0 0))", borderRadius: 4 }} />
        <span style={{ height: 10, width: "70%", background: "var(--secondary, oklch(0.27 0 0))", borderRadius: 4 }} />
      </div>
    );
  }
  return <FallbackPanel card={card} onRetry={onRetry} />;
}

function FallbackPanel({ card, onRetry }: { card: BriefCard; onRetry: () => void }) {
  const reason = card.snapshot.summaryFailureReason ?? "model_error";
  const reasonLabel = formatFailureReason(reason);
  return (
    <div
      data-briefs-summary-fallback
      style={{
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
        padding: "8px 10px",
        borderRadius: 6,
        borderLeft: `3px solid ${toneColors.red.accent}`,
        background: "oklch(0.21 0.03 25 / 50%)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: toneColors.red.badgeFg }}>{summaryFallbackLabel}</div>
        <div style={{ fontSize: 12, color: tokens.fg, marginTop: 2 }}>{derivedSynopsis(card)}</div>
        <div style={{ fontSize: 11, color: tokens.muted, marginTop: 4 }}>{reasonLabel}</div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        style={{
          padding: "4px 8px",
          fontSize: 11,
          borderRadius: 6,
          border: `1px solid ${tokens.border}`,
          background: tokens.card,
          color: tokens.fg,
          cursor: "pointer",
        }}
      >
        Refresh
      </button>
    </div>
  );
}

function derivedSynopsis(card: BriefCard): string {
  const blocked = card.snapshot.taskRows.find((row) => row.rightTag.toLowerCase().includes("blocked"));
  if (blocked) return `${blocked.identifier ?? "Item"} is blocked: ${blocked.titleLine}.`;
  const waiting = card.snapshot.taskRows.find((row) => row.rightTag.toLowerCase().includes("ask"));
  if (waiting) return `${waiting.identifier ?? "Item"} is waiting on you.`;
  if (card.snapshot.taskRows[0]) {
    return `${card.snapshot.taskRows[0].identifier ?? "Recent"}: ${card.snapshot.taskRows[0].titleLine}.`;
  }
  return "Recent activity recorded.";
}

function formatFailureReason(reason: string): string {
  switch (reason) {
    case "model_error":
      return "Generator returned an error";
    case "truncation_failed":
      return "Source data could not be truncated cleanly";
    case "budget_capped":
      return "Summary skipped to stay under budget";
    case "safety_block":
      return "Safety guard blocked the summary";
    default:
      return reason;
  }
}

function SourceRows({ rows }: { rows: BriefTaskRow[] }) {
  if (rows.length === 0) return null;
  return (
    <ul data-briefs-source-rows style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
      {rows.map((row, index) => (
        <li
          key={`${row.kind}-${row.sourceId}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 0",
            borderTop: index === 0 ? "none" : `1px dashed ${tokens.border}`,
            fontSize: 12,
            minWidth: 0,
          }}
        >
          <span aria-hidden style={{ color: tokens.muted, width: 12, textAlign: "center" }}>{sourceKindIcon[row.kind] ?? "•"}</span>
          {row.identifier ? (
            <span style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace", color: tokens.fg, fontSize: 11 }}>{row.identifier}</span>
          ) : null}
          <SourceLink row={row} />
          <RightTag row={row} />
        </li>
      ))}
    </ul>
  );
}

function SourceLink({ row }: { row: BriefTaskRow }) {
  const nav = useHostNavigation();
  const link = nav.linkProps(row.linkPath);
  return (
    <a
      {...link}
      title={row.titleLine}
      style={{ flex: 1, color: tokens.fg, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}
    >
      {row.titleLine}
    </a>
  );
}

function RightTag({ row }: { row: BriefTaskRow }) {
  const lower = row.rightTag.toLowerCase();
  let tone: keyof typeof toneColors = "muted";
  if (lower.includes("block")) tone = "red";
  else if (lower.includes("error") || lower.includes("fail")) tone = "red";
  else if (lower.includes("ask") || lower.includes("user")) tone = "warning";
  else if (lower.includes("review") || lower.includes("approval")) tone = "violet";
  else if (lower.includes("run") || lower.includes("in_progress") || lower.includes("live")) tone = "cyan";
  else if (lower.includes("done") || lower.includes("merged")) tone = "green";
  const swatch = toneColors[tone];
  return (
    <span
      data-briefs-row-tag={tone}
      style={{
        flexShrink: 0,
        fontSize: 10,
        padding: "1px 6px",
        borderRadius: 999,
        background: swatch.badgeBg,
        color: swatch.badgeFg,
        whiteSpace: "nowrap",
      }}
    >
      {rightTagForRow(row)}
      {row.isIntraTreeBlocked ? <span aria-label="intra-tree blocker" style={{ marginLeft: 4, opacity: 0.7 }}>↪</span> : null}
    </span>
  );
}

function Footer({ card, openHref, nav }: { card: BriefCard; openHref: string | null; nav: ReturnType<typeof useHostNavigation> }) {
  const stamp = formatRelative(card.lastMeaningfulEventAt);
  return (
    <footer style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: tokens.muted, paddingTop: 4, marginTop: "auto" }}>
      {card.moreSourceCount > 0 ? <span>+{card.moreSourceCount} more in tree</span> : <span aria-hidden />}
      <span style={{ flex: 1 }} />
      {stamp ? <span>{stamp}</span> : null}
      {openHref ? (
        <a
          {...nav.linkProps(openHref)}
          style={{ color: tokens.fg, textDecoration: "none", fontSize: 11 }}
        >
          Open tree →
        </a>
      ) : null}
    </footer>
  );
}

function primaryOpenHref(card: BriefCard): string | null {
  const candidate = card.sources[0] ?? card.snapshot.taskRows[0];
  return candidate?.linkPath ?? null;
}

function collectIdentifiers(card: BriefCard): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const source of [...card.snapshot.taskRows, ...card.sources]) {
    if (source.identifier && !seen.has(source.identifier)) {
      seen.add(source.identifier);
      out.push(source.identifier);
    }
  }
  return out;
}

function uniqueIssueCount(card: BriefCard): number {
  const seen = new Set<string>();
  for (const source of card.sources) {
    if (source.sourceKind === "issue" && source.issueId) seen.add(source.issueId);
  }
  return seen.size;
}

function uniqueAgentCount(card: BriefCard): number {
  const seen = new Set<string>();
  for (const source of card.sources) {
    const metadata = source.metadata as Record<string, unknown> | undefined;
    const value = metadata && typeof metadata.assigneeAgentId === "string" ? metadata.assigneeAgentId : null;
    if (value) seen.add(value);
  }
  return seen.size;
}

function Legend() {
  const items: Array<{ state: BriefCardState }> = [
    { state: "error" },
    { state: "blocked" },
    { state: "waiting-user" },
    { state: "waiting-reviewer" },
    { state: "live" },
    { state: "done" },
    { state: "stale" },
  ];
  return (
    <div data-briefs-legend style={{ marginTop: 24, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, fontSize: 11, color: tokens.muted, paddingTop: 12, borderTop: `1px solid ${tokens.border}` }}>
      <span style={{ textTransform: "uppercase", letterSpacing: 0.6 }}>Legend</span>
      {items.map((item) => {
        const tone = toneColors[stateTone[item.state]];
        return (
          <span key={item.state} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: tone.accent }} aria-hidden />
            <span>{stateBadgeLabel[item.state]}</span>
          </span>
        );
      })}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div
      data-briefs-empty
      style={{
        padding: "40px 24px",
        border: `1px dashed ${tokens.border}`,
        borderRadius: 10,
        textAlign: "center",
        color: tokens.muted,
      }}
    >
      <div style={{ fontSize: 15, color: tokens.fg, fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13 }}>{body}</div>
    </div>
  );
}

function LoadingState() {
  return (
    <div data-briefs-loading style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 360px), 1fr))", gap: 12 }}>
      {[0, 1, 2, 3].map((index) => (
        <div key={index} style={{ height: 160, borderRadius: 10, background: tokens.card, border: `1px solid ${tokens.border}`, padding: 14 }} aria-hidden>
          <div style={{ height: 10, width: "60%", background: "var(--secondary, oklch(0.27 0 0))", borderRadius: 4, marginBottom: 8 }} />
          <div style={{ height: 8, width: "90%", background: "var(--secondary, oklch(0.27 0 0))", borderRadius: 4, marginBottom: 4 }} />
          <div style={{ height: 8, width: "70%", background: "var(--secondary, oklch(0.27 0 0))", borderRadius: 4 }} />
        </div>
      ))}
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      data-briefs-error
      style={{
        padding: 16,
        border: `1px solid ${toneColors.red.accent}`,
        borderRadius: 10,
        background: "oklch(0.21 0.04 25 / 60%)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: toneColors.red.badgeFg }}>Could not load briefing</div>
      <div style={{ fontSize: 12, color: tokens.muted }}>{message}</div>
      <div>
        <button
          type="button"
          onClick={onRetry}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: `1px solid ${tokens.border}`,
            background: tokens.card,
            color: tokens.fg,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}

// Inject responsive CSS once per page mount. Inline style attributes cannot
// express media queries, so the mobile rules are added through a stylesheet.
if (typeof document !== "undefined" && !document.getElementById("briefs-plugin-styles")) {
  const style = document.createElement("style");
  style.id = "briefs-plugin-styles";
  // !important is required so these rules win against the inline
  // style attributes set on <section data-briefs-section> and its <header>;
  // attribute-selector specificity (0,1,1) loses to inline (1,0,0,0) otherwise.
  style.textContent = `
    @media (max-width: 700px) {
      [data-briefs-mobile-tabs] { display: flex !important; }
      [data-briefs-section] > header { display: none !important; }
      [data-briefs-section][data-mobile-hidden="true"] { display: none !important; }
      [data-briefs-grid] { grid-template-columns: 1fr !important; }
      [data-briefs-page-header] > [data-briefs-page-meta] { flex-basis: 100% !important; order: 2 !important; }
    }
  `;
  document.head.appendChild(style);
}
