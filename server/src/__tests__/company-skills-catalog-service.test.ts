import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { companies, companySkills, createDb } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import type { CatalogSkill } from "@paperclipai/shared";

const sampleCatalogSkill: CatalogSkill = {
  id: "paperclipai:bundled:software-development:review",
  key: "paperclipai/bundled/software-development/review",
  kind: "bundled",
  category: "software-development",
  slug: "review",
  name: "review",
  description: "Review code",
  path: "catalog/bundled/software-development/review",
  entrypoint: "SKILL.md",
  trustLevel: "markdown_only",
  compatibility: "compatible",
  defaultInstall: false,
  recommendedForRoles: ["engineer"],
  requires: [],
  tags: ["review"],
  files: [
    { path: "SKILL.md", kind: "skill", sizeBytes: 8, sha256: "abc" },
    { path: "references/checklist.md", kind: "reference", sizeBytes: 10, sha256: "def" },
  ],
  contentHash: "sha256:abc",
};

const mockCatalogService = vi.hoisted(() => ({
  getCatalogPackageMetadata: vi.fn(() => ({
    packageName: "@paperclipai/skills-catalog",
    packageVersion: "0.3.1",
  })),
  getCatalogSkillOrThrow: vi.fn(),
  readCatalogSkillFile: vi.fn(),
}));

vi.doMock("../services/skills-catalog.js", () => mockCatalogService);

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres company skill catalog service tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("companySkillService.installFromCatalog", () => {
  let db!: ReturnType<typeof createDb>;
  let svc!: Awaited<ReturnType<typeof createService>>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let oldPaperclipHome: string | undefined;
  const cleanupDirs = new Set<string>();

  async function createService() {
    const { companySkillService } = await import("../services/company-skills.js");
    return companySkillService(db);
  }

  async function createCompany() {
    const companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    return companyId;
  }

  beforeAll(async () => {
    oldPaperclipHome = process.env.PAPERCLIP_HOME;
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-company-skills-catalog-");
    db = createDb(tempDb.connectionString);
    svc = await createService();
  }, 20_000);

  beforeEach(async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-catalog-home-"));
    cleanupDirs.add(home);
    process.env.PAPERCLIP_HOME = home;
    mockCatalogService.getCatalogSkillOrThrow.mockReturnValue(sampleCatalogSkill);
    mockCatalogService.readCatalogSkillFile.mockImplementation(async (_ref: string, filePath: string) => ({
      catalogSkillId: sampleCatalogSkill.id,
      path: filePath,
      kind: filePath === "SKILL.md" ? "skill" : "reference",
      content: filePath === "SKILL.md" ? "# Review\n" : "# Checklist\n",
      language: "markdown",
      markdown: true,
    }));
  });

  afterEach(async () => {
    await db.delete(companySkills);
    await db.delete(companies);
    await Promise.all(Array.from(cleanupDirs, (dir) => fs.rm(dir, { recursive: true, force: true })));
    cleanupDirs.clear();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    if (oldPaperclipHome === undefined) delete process.env.PAPERCLIP_HOME;
    else process.env.PAPERCLIP_HOME = oldPaperclipHome;
    await tempDb?.cleanup();
  });

  it("creates a company skill with catalog provenance and materialized files", async () => {
    const companyId = await createCompany();

    const result = await svc.installFromCatalog(companyId, {
      catalogSkillId: sampleCatalogSkill.id,
    });

    expect(result.action).toBe("created");
    expect(result.skill).toMatchObject({
      companyId,
      key: sampleCatalogSkill.key,
      slug: sampleCatalogSkill.slug,
      sourceType: "catalog",
      sourceRef: sampleCatalogSkill.contentHash,
      trustLevel: "markdown_only",
      compatibility: "compatible",
      metadata: expect.objectContaining({
        sourceKind: "catalog",
        catalogId: sampleCatalogSkill.id,
        catalogKey: sampleCatalogSkill.key,
        catalogKind: "bundled",
        catalogCategory: "software-development",
        packageName: "@paperclipai/skills-catalog",
        originHash: sampleCatalogSkill.contentHash,
      }),
    });
    await expect(fs.readFile(path.join(result.skill.sourceLocator!, "SKILL.md"), "utf8")).resolves.toBe("# Review\n");
    await expect(fs.readFile(path.join(result.skill.sourceLocator!, "references/checklist.md"), "utf8")).resolves.toBe("# Checklist\n");
  });

  it("returns unchanged for an already-current catalog skill", async () => {
    const companyId = await createCompany();
    await svc.installFromCatalog(companyId, { catalogSkillId: sampleCatalogSkill.id });

    const result = await svc.installFromCatalog(companyId, { catalogSkillId: sampleCatalogSkill.id });

    expect(result.action).toBe("unchanged");
    const rows = await db
      .select()
      .from(companySkills)
      .where(and(eq(companySkills.companyId, companyId), eq(companySkills.key, sampleCatalogSkill.key)));
    expect(rows).toHaveLength(1);
  });

  it("rejects duplicate slug conflicts", async () => {
    const companyId = await createCompany();
    const skillDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-existing-skill-"));
    cleanupDirs.add(skillDir);
    await fs.writeFile(path.join(skillDir, "SKILL.md"), "# Existing\n", "utf8");
    await db.insert(companySkills).values({
      companyId,
      key: `company/${companyId}/review`,
      slug: "review",
      name: "Existing Review",
      description: null,
      markdown: "# Existing\n",
      sourceType: "local_path",
      sourceLocator: skillDir,
      trustLevel: "markdown_only",
      compatibility: "compatible",
      fileInventory: [{ path: "SKILL.md", kind: "skill" }],
      metadata: { sourceKind: "local_path" },
    });

    await expect(svc.installFromCatalog(companyId, {
      catalogSkillId: sampleCatalogSkill.id,
    })).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('Skill slug "review" is already used'),
    });
  });
});
