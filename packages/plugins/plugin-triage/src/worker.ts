import {
  definePlugin,
  runWorker,
  type PluginContext,
  type PluginManagedAgentResolution,
  type PluginManagedProjectResolution,
  type PluginManagedSkillResolution,
} from "@paperclipai/plugin-sdk";
import {
  TRIAGE_ASSISTANT_AGENT_KEY,
  TRIAGE_MANAGED_SKILL_KEYS,
  TRIAGE_PROJECT_KEY,
} from "./manifest.js";

type ManagedResourceHealth = {
  status: "needs_company" | "missing" | "ready";
  checkedAt: string;
  agent: ManagedAgentHealth | null;
  project: ManagedProjectHealth | null;
  skills: ManagedSkillHealth[];
};

type ManagedAgentHealth = {
  resourceKey: string;
  status: PluginManagedAgentResolution["status"];
  agentId: string | null;
  name: string | null;
  agentStatus: string | null;
  adapterType: string | null;
};

type ManagedProjectHealth = {
  resourceKey: string;
  status: PluginManagedProjectResolution["status"];
  projectId: string | null;
  name: string | null;
  projectStatus: string | null;
};

type ManagedSkillHealth = {
  resourceKey: string;
  status: PluginManagedSkillResolution["status"];
  skillId: string | null;
  name: string | null;
  key: string | null;
};

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requireCompanyId(params: Record<string, unknown>): string {
  const companyId = stringField(params.companyId);
  if (!companyId) {
    throw new Error("companyId is required");
  }
  return companyId;
}

function summarizeAgent(resolution: PluginManagedAgentResolution): ManagedAgentHealth {
  return {
    resourceKey: resolution.resourceKey,
    status: resolution.status,
    agentId: resolution.agentId,
    name: resolution.agent?.name ?? null,
    agentStatus: resolution.agent?.status ?? null,
    adapterType: resolution.agent?.adapterType ?? null,
  };
}

function summarizeProject(resolution: PluginManagedProjectResolution): ManagedProjectHealth {
  return {
    resourceKey: resolution.resourceKey,
    status: resolution.status,
    projectId: resolution.projectId,
    name: resolution.project?.name ?? null,
    projectStatus: resolution.project?.status ?? null,
  };
}

function summarizeSkill(resolution: PluginManagedSkillResolution): ManagedSkillHealth {
  return {
    resourceKey: resolution.resourceKey,
    status: resolution.status,
    skillId: resolution.skillId,
    name: resolution.skill?.name ?? null,
    key: resolution.skill?.key ?? null,
  };
}

async function managedResourceHealth(
  ctx: PluginContext,
  companyId: string,
  mode: "inspect" | "reconcile",
): Promise<ManagedResourceHealth> {
  const projectResolution = mode === "reconcile"
    ? await ctx.projects.managed.reconcile(TRIAGE_PROJECT_KEY, companyId)
    : await ctx.projects.managed.get(TRIAGE_PROJECT_KEY, companyId);
  const skillResolutions = await Promise.all(
    TRIAGE_MANAGED_SKILL_KEYS.map((skillKey) =>
      mode === "reconcile"
        ? ctx.skills.managed.reconcile(skillKey, companyId)
        : ctx.skills.managed.get(skillKey, companyId),
    ),
  );
  const agentResolution = mode === "reconcile"
    ? await ctx.agents.managed.reconcile(TRIAGE_ASSISTANT_AGENT_KEY, companyId)
    : await ctx.agents.managed.get(TRIAGE_ASSISTANT_AGENT_KEY, companyId);

  const agent = summarizeAgent(agentResolution);
  const project = summarizeProject(projectResolution);
  const skills = skillResolutions.map(summarizeSkill);
  const missing = [
    agent.status === "missing",
    project.status === "missing",
    ...skills.map((skill) => skill.status === "missing"),
  ].some(Boolean);

  return {
    status: missing ? "missing" : "ready",
    checkedAt: new Date().toISOString(),
    agent,
    project,
    skills,
  };
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.data.register("managed-resource-health", async (params: Record<string, unknown>) => {
      const companyId = stringField(params.companyId);
      if (!companyId) {
        return {
          status: "needs_company",
          checkedAt: new Date().toISOString(),
          agent: null,
          project: null,
          skills: [],
        } satisfies ManagedResourceHealth;
      }

      return managedResourceHealth(ctx, companyId, "inspect");
    });

    ctx.actions.register("reconcile-managed-resources", async (params: Record<string, unknown>) => {
      const companyId = requireCompanyId(params);
      const result = await managedResourceHealth(ctx, companyId, "reconcile");
      ctx.logger.info("Reconciled Paperclip Triage managed resources", {
        companyId,
        agentStatus: result.agent?.status,
        projectStatus: result.project?.status,
        skillStatuses: result.skills.map((skill) => `${skill.resourceKey}:${skill.status}`),
      });
      return result;
    });
  },

  async onHealth() {
    return { status: "ok", message: "Paperclip Triage worker is running" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
