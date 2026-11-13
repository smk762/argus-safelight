/**
 * Where the in-context help points: darkroom's own docs as `/docs` renders them at the commit in `schema/pins.json`.
 * `docsLinks.test.ts` renders those pages and fails when an anchor here no longer exists, so a heading renamed in
 * darkroom breaks `make test` in the sync PR that brings it in, not a link in production.
 */
import type { Outcome } from "./types";

import pins from "../../schema/pins.json";

/** The imported darkroom docs, by route. `file` is the path in darkroom's repo; `sections` keeps those `##` sections only. */
export const DOC_PAGES = [
  { slug: "", file: "README.md", title: "Overview", sections: null },
  {
    slug: "design",
    file: "spec.md",
    title: "Design",
    // The build doc's reference sections. Its plan, open questions and acceptance list stay on GitHub.
    sections: ["Flow", "Policies", "Verdicts", "Prompt framing", "Record", "What it does not do"],
  },
] as const;

export type DocPage = (typeof DOC_PAGES)[number];

export const docsHref = (page: DocPage, anchor?: string): string => `/docs${page.slug ? `/${page.slug}` : ""}${anchor ? `#${anchor}` : ""}`;

const [OVERVIEW, DESIGN] = DOC_PAGES;

export const DOCS = {
  home: docsHref(OVERVIEW),
  pipeline: docsHref(OVERVIEW, "how-a-generation-runs"),
  configuration: docsHref(OVERVIEW, "configuration"),
  cli: docsHref(OVERVIEW, "cli"),
  api: docsHref(OVERVIEW, "http-api"),
  ageCheck: docsHref(OVERVIEW, "age-check-optional"),
  flow: docsHref(DESIGN, "flow"),
  scans: docsHref(DESIGN, "flow"),
  verdicts: docsHref(DESIGN, "verdicts"),
  policies: docsHref(DESIGN, "policies"),
  mode: docsHref(DESIGN, "mode"),
  illegalRules: docsHref(DESIGN, "illegal-rules"),
  record: docsHref(DESIGN, "record"),
} as const;

/** Thinking modes are a configuration setting in darkroom's docs (`THINKING`). */
export const THINKING_DOCS = DOCS.configuration;

/** Each outcome's definition. Refused is decided at pre-flight (or the input's scan); failed is in the README's outcome table. */
export const OUTCOME_DOCS: Record<Outcome, string> = {
  passed: DOCS.verdicts,
  review: DOCS.verdicts,
  deleted: DOCS.verdicts,
  omitted: DOCS.verdicts,
  refused: DOCS.flow,
  failed: DOCS.pipeline,
};

/** Ollama's own install guide. Studio's "Setup and services" pages (argus-studio#172) will replace this once they exist. */
export const OLLAMA_SETUP = "https://docs.ollama.com/linux";

export interface DarkroomPin {
  repo: string;
  branch: string;
  commit: string;
  version: string;
  pypi: string;
}

export const DARKROOM: DarkroomPin = pins.darkroom;

export const darkroomLinks = (pin: DarkroomPin = DARKROOM) => ({
  github: `https://github.com/${pin.repo}/tree/${pin.commit}`,
  blob: (path: string) => `https://github.com/${pin.repo}/blob/${pin.commit}/${path}`,
  changelog: `https://github.com/${pin.repo}/blob/${pin.commit}/CHANGELOG.md`,
  pypi: `https://pypi.org/project/${pin.pypi}/`,
});
