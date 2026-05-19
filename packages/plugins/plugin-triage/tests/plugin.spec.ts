import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest, {
  PLUGIN_ID,
  TRIAGE_ASSISTANT_AGENT_KEY,
  TRIAGE_MANAGED_SKILL_CANONICAL_KEYS,
  TRIAGE_MANAGED_SKILL_KEYS,
  TRIAGE_PROJECT_KEY,
} from "../src/manifest.js";
import plugin from "../src/worker.js";

const COMPANY_ID = "company-1";

describe("Paperclip Triage scaffold", () => {
  it("declares the package manifest, UI slots, and managed resources", () => {
    expect(manifest.id).toBe(PLUGIN_ID);
    expect(manifest.capabilities).toEqual(expect.arrayContaining([
      "agents.managed",
      "projects.managed",
      "skills.managed",
      "instance.settings.register",
      "ui.sidebar.register",
      "ui.page.register",
    ]));
    expect(manifest.ui?.slots).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "sidebar", exportName: "SidebarLink" }),
      expect.objectContaining({ type: "page", exportName: "TriagePage", routePath: "triage" }),
      expect.objectContaining({ type: "routeSidebar", exportName: "TriageRouteSidebar", routePath: "triage" }),
      expect.objectContaining({ type: "settingsPage", exportName: "SettingsPage" }),
    ]));
    expect(manifest.agents?.[0]).toEqual(expect.objectContaining({
      agentKey: TRIAGE_ASSISTANT_AGENT_KEY,
      displayName: "Triage Assistant",
      status: "paused",
      permissions: { pluginTools: [PLUGIN_ID] },
    }));
    expect(manifest.agents?.[0]?.adapterConfig?.paperclipSkillSync).toEqual({
      desiredSkills: TRIAGE_MANAGED_SKILL_CANONICAL_KEYS,
    });
    expect(manifest.projects?.[0]).toEqual(expect.objectContaining({
      projectKey: TRIAGE_PROJECT_KEY,
      displayName: "Triage",
    }));
    expect(manifest.skills?.map((skill) => skill.skillKey)).toEqual(TRIAGE_MANAGED_SKILL_KEYS);
  });

  it("reports missing managed resources before reconcile", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const health = await harness.getData<{ status: string; skills: Array<{ status: string }> }>(
      "managed-resource-health",
      { companyId: COMPANY_ID },
    );

    expect(health.status).toBe("missing");
    expect(health.skills).toHaveLength(TRIAGE_MANAGED_SKILL_KEYS.length);
    expect(health.skills.every((skill) => skill.status === "missing")).toBe(true);
  });

  it("reconciles managed project, assistant, and skills", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction<{
      status: string;
      agent: { status: string; agentId: string | null };
      project: { status: string; projectId: string | null };
      skills: Array<{ status: string; skillId: string | null; key: string | null }>;
    }>("reconcile-managed-resources", { companyId: COMPANY_ID });

    expect(result.status).toBe("ready");
    expect(result.agent).toEqual(expect.objectContaining({ status: "created" }));
    expect(result.agent.agentId).toBeTruthy();
    expect(result.project).toEqual(expect.objectContaining({ status: "created" }));
    expect(result.project.projectId).toBeTruthy();
    expect(result.skills).toHaveLength(TRIAGE_MANAGED_SKILL_KEYS.length);
    expect(result.skills.every((skill) => skill.status === "created")).toBe(true);
    expect(result.skills.map((skill) => skill.key)).toEqual(TRIAGE_MANAGED_SKILL_CANONICAL_KEYS);
  });
});
