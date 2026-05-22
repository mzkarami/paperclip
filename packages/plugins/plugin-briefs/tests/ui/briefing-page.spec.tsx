/**
 * Regression tests for the Briefing page chrome — the parts the screenshot
 * fixture used to skip (MobileTabs, Legend, responsive CSS injection).
 *
 * These tests served as the verification path for the UX review on PAP-9963:
 * before the fix, the screenshot fixture hand-wrote the page shell and never
 * exercised these components, which masked a CSS-specificity bug that broke
 * the mobile section filter. Asserting on the real `<BriefingPage>` output
 * keeps that gap closed.
 */
import { describe, expect, it, vi } from "vitest";

import type { BriefCard, BriefPreferences } from "../../src/contracts.js";
import { gallery } from "./fixtures.js";

type PageData = {
  cards: BriefCard[];
  preferences: BriefPreferences;
  fetchedAt: string;
};

const defaultPreferences: BriefPreferences = {
  companyId: "company-1",
  userId: "user-1",
  cadence: "daily",
  retentionDays: 14,
  doneRetentionHours: 48,
  staleAfterDays: 7,
  maxUnpinnedCards: 24,
  scope: "user",
};

let mockPageData: PageData = {
  cards: [],
  preferences: defaultPreferences,
  fetchedAt: "2026-05-22T10:00:00.000Z",
};

vi.mock("@paperclipai/plugin-sdk/ui", () => {
  return {
    useHostNavigation: () => ({
      resolveHref: (to: string) => to,
      navigate: () => {},
      linkProps: (to: string) => ({ href: to, onClick: () => {} }),
    }),
    usePluginAction: () => vi.fn(async () => ({ ok: true })),
    usePluginData: (key: string) => {
      if (key === "page") {
        return { data: mockPageData, loading: false, error: null, refresh: () => {} };
      }
      return { data: null, loading: false, error: null, refresh: () => {} };
    },
    usePluginToast: () => vi.fn(),
    useHostLocation: () => ({ pathname: "/PAP/briefs", search: "", hash: "" }),
    usePluginStream: () => ({ events: [], lastEvent: null, connecting: false, connected: false, error: null, close: () => {} }),
  };
});

import { renderToStaticMarkup } from "react-dom/server";
import { BriefingPage } from "../../src/ui/app.js";

const hostContext = {
  companyId: "company-1",
  companyPrefix: "PAP",
  projectId: null,
  entityId: null,
  entityType: null,
  userId: "user-1",
} as const;

function renderPage(cards: BriefCard[]): string {
  mockPageData = { cards, preferences: defaultPreferences, fetchedAt: "2026-05-22T10:00:00.000Z" };
  return renderToStaticMarkup(<BriefingPage context={hostContext as never} />);
}

describe("BriefingPage", () => {
  it("renders the MobileTabs sticky bar so it appears in screenshots", () => {
    const html = renderPage(gallery());
    expect(html).toContain("data-briefs-mobile-tabs");
    expect(html).toMatch(/aria-label="Briefing sections"/);
    // All four tabs must be present: All / Needs you / Live / Done.
    expect(html).toContain(">All<");
    expect(html).toContain(">Needs you<");
    expect(html).toContain(">Live<");
    expect(html).toContain(">Done<");
  });

  it("renders the Legend below the section grid", () => {
    const html = renderPage(gallery());
    expect(html).toContain("data-briefs-legend");
  });

  it("marks non-active sections with data-mobile-hidden so the CSS filter has a target", () => {
    const html = renderPage(gallery());
    // The default mobile tab is "attention", so every other section must be
    // tagged hidden. Without the CSS `!important` fix, this attribute existed
    // but did nothing — the test still guards the data contract.
    expect(html).toContain('data-briefs-section="live"');
    expect(html).toContain('data-briefs-section="settled"');
    expect(html).toMatch(/data-briefs-section="live"[^>]*data-mobile-hidden="true"/);
    expect(html).toMatch(/data-briefs-section="settled"[^>]*data-mobile-hidden="true"/);
  });

  it("tags the page header meta block so mobile reflow CSS can reorder it", () => {
    const html = renderPage(gallery());
    expect(html).toContain("data-briefs-page-header");
    expect(html).toContain("data-briefs-page-meta");
  });

  it("renders the empty state without rendering MobileTabs or sections", () => {
    const html = renderPage([]);
    expect(html).not.toContain("data-briefs-mobile-tabs");
    expect(html).not.toContain("data-briefs-section");
    expect(html).toContain("No briefs yet");
  });
});
