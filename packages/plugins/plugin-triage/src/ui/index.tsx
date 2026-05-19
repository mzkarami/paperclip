import {
  useHostNavigation,
  usePluginAction,
  usePluginData,
  usePluginToast,
  type PluginPageProps,
  type PluginRouteSidebarProps,
  type PluginSettingsPageProps,
  type PluginSidebarProps,
} from "@paperclipai/plugin-sdk/ui";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";

type ManagedResourceHealth = {
  status: "needs_company" | "missing" | "ready";
  checkedAt: string;
  agent: {
    resourceKey: string;
    status: string;
    agentId: string | null;
    name: string | null;
    agentStatus: string | null;
    adapterType: string | null;
  } | null;
  project: {
    resourceKey: string;
    status: string;
    projectId: string | null;
    name: string | null;
    projectStatus: string | null;
  } | null;
  skills: Array<{
    resourceKey: string;
    status: string;
    skillId: string | null;
    name: string | null;
    key: string | null;
  }>;
};

const tokens = {
  border: "var(--border, oklch(0.86 0 0))",
  bg: "var(--background, #ffffff)",
  fg: "var(--foreground, #18181b)",
  muted: "var(--muted-foreground, #71717a)",
  accent: "var(--accent, #f4f4f5)",
  accentFg: "var(--accent-foreground, #18181b)",
  primary: "var(--primary, #18181b)",
  primaryFg: "var(--primary-foreground, #ffffff)",
  success: "oklch(0.55 0.13 155)",
  warning: "oklch(0.64 0.14 75)",
};

const pageShell: CSSProperties = {
  display: "grid",
  gap: 20,
  padding: 24,
  color: tokens.fg,
  background: tokens.bg,
  minHeight: "100%",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
};

const panelStyle: CSSProperties = {
  border: `1px solid ${tokens.border}`,
  borderRadius: 8,
  padding: 16,
  display: "grid",
  gap: 12,
};

const mutedStyle: CSSProperties = {
  color: tokens.muted,
  fontSize: 13,
};

function useManagedResourceHealth(companyId: string | null) {
  const params = useMemo(() => ({ companyId: companyId ?? "" }), [companyId]);
  return usePluginData<ManagedResourceHealth>("managed-resource-health", params);
}

function statusTone(status: string): CSSProperties {
  if (status === "ready" || status === "resolved" || status === "created") {
    return { color: tokens.success };
  }
  if (status === "missing" || status === "needs_company") {
    return { color: tokens.warning };
  }
  return { color: tokens.muted };
}

function StatusText({ status }: { status: string }) {
  return (
    <span style={{ ...statusTone(status), fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

function ResourceRow({
  label,
  status,
  detail,
}: {
  label: string;
  status: string;
  detail?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(120px, 1fr) auto",
        gap: 12,
        alignItems: "start",
        padding: "8px 0",
        borderTop: `1px solid ${tokens.border}`,
      }}
    >
      <div style={{ display: "grid", gap: 3 }}>
        <strong style={{ fontSize: 13 }}>{label}</strong>
        {detail ? <span style={mutedStyle}>{detail}</span> : null}
      </div>
      <StatusText status={status} />
    </div>
  );
}

function ManagedResourcePanel({
  companyId,
  allowReconcile,
}: {
  companyId: string | null;
  allowReconcile: boolean;
}) {
  const { data, loading, error, refresh } = useManagedResourceHealth(companyId);
  const reconcile = usePluginAction("reconcile-managed-resources");
  const toast = usePluginToast();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleReconcile() {
    if (!companyId) return;
    setBusy(true);
    setActionError(null);
    try {
      await reconcile({ companyId });
      refresh();
      toast({ title: "Triage resources reconciled", tone: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reconcile resources";
      setActionError(message);
      toast({ title: "Reconcile failed", body: message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>Managed Resources</h2>
          <div style={mutedStyle}>Last checked: {data?.checkedAt ?? "not checked"}</div>
        </div>
        {allowReconcile ? (
          <button
            type="button"
            onClick={() => void handleReconcile()}
            disabled={!companyId || busy}
            style={{
              border: `1px solid ${tokens.primary}`,
              borderRadius: 6,
              background: tokens.primary,
              color: tokens.primaryFg,
              padding: "7px 10px",
              fontSize: 13,
              fontWeight: 600,
              cursor: companyId && !busy ? "pointer" : "not-allowed",
              opacity: companyId && !busy ? 1 : 0.55,
            }}
          >
            {busy ? "Reconciling" : "Reconcile"}
          </button>
        ) : null}
      </div>

      {loading ? <div style={mutedStyle}>Loading resources...</div> : null}
      {error ? <div style={{ color: tokens.warning, fontSize: 13 }}>{error.message}</div> : null}
      {actionError ? <div style={{ color: tokens.warning, fontSize: 13 }}>{actionError}</div> : null}

      {data ? (
        <div>
          <ResourceRow label="Package Health" status={data.status} />
          <ResourceRow
            label="Triage Project"
            status={data.project?.status ?? "missing"}
            detail={data.project?.name ?? "Triage"}
          />
          <ResourceRow
            label="Triage Assistant"
            status={data.agent?.status ?? "missing"}
            detail={
              data.agent
                ? `${data.agent.name ?? "Triage Assistant"} (${data.agent.agentStatus ?? "unknown"})`
                : "Triage Assistant"
            }
          />
          {data.skills.map((skill) => (
            <ResourceRow
              key={skill.resourceKey}
              label={skill.name ?? skill.resourceKey}
              status={skill.status}
              detail={skill.key ?? skill.resourceKey}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function SidebarLink({ context }: PluginSidebarProps) {
  const nav = useHostNavigation();
  return (
    <a
      {...nav.linkProps("/triage")}
      style={{
        color: "inherit",
        textDecoration: "none",
        display: "block",
        padding: "6px 8px",
        borderRadius: 6,
        fontSize: 14,
      }}
      aria-label={`Open Triage for ${context.companyPrefix ?? "company"}`}
    >
      Triage
    </a>
  );
}

export function TriageRouteSidebar({ context }: PluginRouteSidebarProps) {
  const nav = useHostNavigation();
  const { data } = useManagedResourceHealth(context.companyId);

  return (
    <aside style={{ padding: 12, display: "grid", gap: 14, color: tokens.fg }}>
      <a
        {...nav.linkProps("/triage")}
        style={{ color: "inherit", textDecoration: "none", fontWeight: 700, fontSize: 14 }}
      >
        Triage
      </a>
      <nav style={{ display: "grid", gap: 6, fontSize: 13 }}>
        <a {...nav.linkProps("/triage")} style={{ color: "inherit", textDecoration: "none" }}>Queues</a>
        <a {...nav.linkProps("/triage#resources")} style={{ color: "inherit", textDecoration: "none" }}>Resources</a>
      </nav>
      <div style={{ ...mutedStyle, borderTop: `1px solid ${tokens.border}`, paddingTop: 10 }}>
        <StatusText status={data?.status ?? "missing"} />
      </div>
    </aside>
  );
}

export function TriagePage({ context }: PluginPageProps) {
  return (
    <main style={pageShell}>
      <header style={{ display: "grid", gap: 4 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Triage</h1>
        <div style={mutedStyle}>Queue workbench scaffold</div>
      </header>

      <section style={{ ...panelStyle, minHeight: 220 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Queues</h2>
          <div style={mutedStyle}>Queue data model is implemented in the next phase.</div>
        </div>
      </section>

      <div id="resources">
        <ManagedResourcePanel companyId={context.companyId} allowReconcile={false} />
      </div>
    </main>
  );
}

export function SettingsPage({ context }: PluginSettingsPageProps) {
  return (
    <main style={pageShell}>
      <header style={{ display: "grid", gap: 4 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Triage Settings</h1>
        <div style={mutedStyle}>Managed project, assistant, and skills</div>
      </header>
      <ManagedResourcePanel companyId={context.companyId} allowReconcile={true} />
    </main>
  );
}
