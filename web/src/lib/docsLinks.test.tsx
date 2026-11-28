import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DocArticle } from "@/components/DocArticle";

import { docHeadings, slugger } from "./docs";
import { DARKROOM, DOC_PAGES, DOCS, OLLAMA_SETUP, OUTCOME_DOCS, SERVICE_SETUP, THINKING_DOCS, docsHref, type DocPage } from "./docsLinks";

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

  const transform = async (page: DocPage, markdown: string, read?: (page: DocPage) => string) => {
    const { darkroomDoc } = await import("./docs");
    const [{ unified }, { default: remarkParse }] = await Promise.all([import("unified"), import("remark-parse")]);
    const processor = unified().use(remarkParse).use(darkroomDoc(page, DARKROOM, read).plugin);
    return JSON.stringify(await processor.run(processor.parse(markdown)));
  };

  it("send an anchor into a section another page left out to GitHub", async () => {
    const [overview, design] = DOC_PAGES;
    const spec = "# S\n\n## Flow\n\nx\n\n## Build order\n\ny\n";
    const tree = await transform(overview, "See [flow](spec.md#flow) and [order](spec.md#build-order).\n", (doc) => (doc === design ? spec : ""));
    expect(tree.match(/"url":"[^"]+"/g)).toEqual(['"url":"/docs/design#flow"', `"url":"https://github.com/${DARKROOM.repo}/blob/${DARKROOM.commit}/spec.md#build-order"`]);
  });

  it("drop a remote image by reference with its badge link, and load a relative one from the vendored copy", async () => {
    const markdown = "[![ci][badge]][run]\n\n![flow][pic]\n\n[badge]: https://img.shields.io/ci.svg\n[run]: https://github.com/x/actions\n[pic]: docs/flow.png\n";
    const tree = await transform(DOC_PAGES[0], markdown);
    expect(tree).not.toContain('"type":"linkReference"');
    const images: string[] = [];
    JSON.parse(tree, (key, value) => (value?.type === "imageReference" ? images.push(value.identifier) && value : value));
    expect(images).toEqual(["pic"]);
    expect(tree).toContain('"url":"/docs/darkroom/docs/flow.png"');
  });

  it("read a root-relative link from darkroom's repo root, not this site's", async () => {
    const page = { slug: "guide", file: "docs/guide.md", title: "Guide", sections: null } as unknown as DocPage;
    const tree = await transform(page, "[licence](/LICENSE) and [design](/spec.md)\n", () => "");
    expect(tree.match(/"url":"[^"]+"/g)).toEqual([`"url":"https://github.com/${DARKROOM.repo}/blob/${DARKROOM.commit}/LICENSE"`, '"url":"/docs/design"']);
  });

  it("load a root-relative image from the repo's root, and drop one outside the repo", async () => {
    const page = { slug: "guide", file: "docs/guide.md", title: "Guide", sections: null } as unknown as DocPage;
    const tree = await transform(page, "![a](/img/a.png) ![b](b.png) ![c](../../c.png)\n");
    expect(tree.match(/"url":"[^"]+"/g)).toEqual(['"url":"/docs/darkroom/img/a.png"', '"url":"/docs/darkroom/docs/b.png"']);
  });
});

// Audit pack-argus-safelight-4809b2c709: Studio's "Setup and services" pages exist now, in argus-handbook.
describe("service setup links", () => {
  it("point at the suite handbook's setup pages, not the services' own guides", () => {
    for (const [name, href] of Object.entries(SERVICE_SETUP)) {
      const url = new URL(href);
      expect(url.hostname, name).toBe("docs.dragonhound.dev");
      expect(url.pathname, name).toMatch(/^\/setup\/services\/[a-z]+\/$/);
    }
    expect(OLLAMA_SETUP).toBe(SERVICE_SETUP.Ollama);
  });
});
