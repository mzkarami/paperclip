import { describe, expect, it } from "vitest";
import {
  catalogSkillFileDetailSchema,
  catalogSkillListQuerySchema,
  companySkillInstallCatalogResultSchema,
  companySkillInstallCatalogSchema,
} from "./company-skill.js";

const catalogSkill = {
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
  files: [{ path: "SKILL.md", kind: "skill", sizeBytes: 8, sha256: "abc" }],
  contentHash: "sha256:abc",
};

const companySkill = {
  id: "00000000-0000-4000-8000-000000000001",
  companyId: "00000000-0000-4000-8000-000000000002",
  key: catalogSkill.key,
  slug: catalogSkill.slug,
  name: catalogSkill.name,
  description: catalogSkill.description,
  markdown: "# Review\n",
  sourceType: "catalog",
  sourceLocator: "/tmp/review",
  sourceRef: catalogSkill.contentHash,
  trustLevel: "markdown_only",
  compatibility: "compatible",
  fileInventory: [{ path: "SKILL.md", kind: "skill" }],
  metadata: {
    sourceKind: "catalog",
    catalogId: catalogSkill.id,
    originHash: catalogSkill.contentHash,
  },
  createdAt: "2026-05-26T00:00:00.000Z",
  updatedAt: "2026-05-26T00:00:00.000Z",
};

describe("company skill catalog validators", () => {
  it("accepts catalog list and install request shapes", () => {
    expect(catalogSkillListQuerySchema.parse({
      kind: "bundled",
      category: "software-development",
      q: "review",
    })).toEqual({
      kind: "bundled",
      category: "software-development",
      q: "review",
    });

    expect(companySkillInstallCatalogSchema.parse({
      catalogSkillId: catalogSkill.id,
      slug: "team-review",
      force: true,
    })).toEqual({
      catalogSkillId: catalogSkill.id,
      slug: "team-review",
      force: true,
    });
  });

  it("rejects invalid catalog filter and install payloads", () => {
    expect(() => catalogSkillListQuerySchema.parse({ kind: "external" })).toThrow();
    expect(() => companySkillInstallCatalogSchema.parse({ force: true })).toThrow();
  });

  it("accepts catalog file and install result responses", () => {
    expect(catalogSkillFileDetailSchema.parse({
      catalogSkillId: catalogSkill.id,
      path: "SKILL.md",
      kind: "skill",
      content: "# Review\n",
      language: "markdown",
      markdown: true,
    })).toMatchObject({
      catalogSkillId: catalogSkill.id,
      path: "SKILL.md",
    });

    expect(companySkillInstallCatalogResultSchema.parse({
      action: "created",
      skill: companySkill,
      catalogSkill,
      warnings: [],
    })).toMatchObject({
      action: "created",
      skill: {
        key: catalogSkill.key,
        sourceType: "catalog",
      },
      catalogSkill: {
        id: catalogSkill.id,
      },
    });
  });
});
