import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DocArticle } from "@/components/DocArticle";

import { docHeadings, slugger } from "./docs";
import { DARKROOM, DOC_PAGES, DOCS, OUTCOME_DOCS, THINKING_DOCS, docsHref, type DocPage } from "./docsLinks";

const html = new Map<DocPage, string>(DOC_PAGES.map((page) => [page, renderToStaticMarkup(<DocArticle page={page} />)]));
const idsOn = (page: DocPage) => new Set([...html.get(page)!.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));

describe("in-context help", () => {
  const targets = [...Object.values(DOCS), ...Object.values(OUTCOME_DOCS), THINKING_DOCS];

  it.each(targets.map((href) => [href]))("%s lands on a section of the imported docs", (href) => {
    const [path, anchor] = href.split("#");
    const page = DOC_PAGES.find((doc) => docsHref(doc) === path);
    expect(page, `no docs page at ${path}`).toBeDefined();
    if (anchor) expect(idsOn(page!), `#${anchor} is not on ${path}`).toContain(anchor);
  });
});

describe("the imported docs", () => {
  it("number repeated headings as GitHub does", () => {
    const slug = slugger();
    expect(["CI / Release", "ComfyUI: the `SaveImageWebsocket` node", "Inpainting", "Inpainting"].map(slug)).toEqual(["ci--release", "comfyui-the-saveimagewebsocket-node", "inpainting", "inpainting-1"]);
  });

  it("render without a style attribute, raw HTML or a script, so the CSP needs nothing new", () => {
    for (const markup of html.values()) {
      expect(markup).not.toMatch(/\sstyle="/);
      expect(markup).not.toMatch(/<script|<iframe|<img[^>]+src="https?:/);
    }
  });

  it("keep only the design doc's reference sections, and every heading in the contents", async () => {
    const design = DOC_PAGES[1];
    const top = (await docHeadings(design)).filter((heading) => heading.depth === 2).map((heading) => heading.text);
    expect(top).toEqual(design.sections);
    expect(html.get(design)).not.toContain("Build order");
  });

  it("link darkroom's own files at the pinned commit, and the imported ones on this site", () => {
    const overview = html.get(DOC_PAGES[0])!;
    expect(overview).toContain(`href="https://github.com/${DARKROOM.repo}/blob/${DARKROOM.commit}/schema/darkroom-wire.schema.json"`);
    expect(overview).toContain('href="/docs/design"');
    expect(overview).toMatch(/target="_blank" rel="noopener noreferrer"/);
  });

  it("send an anchor to a section left out to GitHub, and a sibling repo's file to its dev branch", async () => {
    const page = { slug: "design", file: "spec.md", title: "Design", sections: ["Kept"] } as unknown as DocPage;
    const markdown = "# T\n\n## Kept\n\nSee [kept](#kept), [gone](#gone) and [the demo](../argus-safelight/spec.md).\n\n## Gone\n\nx\n";
    const { darkroomDoc } = await import("./docs");
    const [{ unified }, { default: remarkParse }] = await Promise.all([import("unified"), import("remark-parse")]);
    const doc = darkroomDoc(page);
    const processor = unified().use(remarkParse).use(doc.plugin);
    const tree = await processor.run(processor.parse(markdown));
    const urls = JSON.stringify(tree).match(/"url":"[^"]+"/g);
    expect(urls).toEqual(['"url":"#kept"', `"url":"https://github.com/${DARKROOM.repo}/blob/${DARKROOM.commit}/spec.md#gone"`, '"url":"https://github.com/smk762/argus-safelight/blob/dev/spec.md"']);
  });
});
