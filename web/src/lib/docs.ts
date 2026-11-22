/**
 * darkroom's docs, as committed under `content/darkroom/` by `npm run darkroom:pull`, turned into a page at render
 * time on the server. Nothing is fetched at runtime and nothing is injected as HTML: the markdown becomes React
 * elements (react-markdown, no rehype-raw), so the page needs no CSP source it does not already have.
 *
 * The transforms, in one remark pass:
 * - the `#` title goes (the page has its own), and for a page with `sections` only those `##` sections stay;
 * - every heading gets GitHub's id, counted over the whole file so a deep link means what it means on GitHub;
 * - links to another imported doc stay on this site, links into darkroom's repo go to GitHub at the pinned commit,
 *   `../<sibling>/...` goes to that sibling's `dev`, and an anchor whose section was left out (of this page or the
 *   page it points to) goes to GitHub;
 * - remote images (badges), inline or by reference, are dropped, since `img-src` would block them; ones in darkroom's
 *   repo load from the vendored copy (`/x.png` from its root), and one outside it is dropped.
 * Raw HTML is skipped by the renderer.
 */
import { readFileSync } from "node:fs";
import { join, posix } from "node:path";

import type { Definition, Heading, Image, Link, Nodes, Root, RootContent } from "mdast";
import type { Processor } from "unified";

import { DARKROOM, DOC_PAGES, darkroomLinks, docsHref, type DarkroomPin, type DocPage } from "./docsLinks";

const CONTENT = join(process.cwd(), "content", "darkroom");

export function readDoc(page: DocPage): string {
  return readFileSync(join(CONTENT, page.file), "utf8");
}

const textOf = (node: Nodes): string => ("value" in node && typeof node.value === "string" ? node.value : "children" in node ? (node.children as Nodes[]).map(textOf).join("") : "");

/** GitHub's heading ids (github-slugger): lower case, punctuation dropped, spaces to hyphens, repeats numbered. */
export function slugger() {
  const seen = new Map<string, number>();
  return (text: string): string => {
    const base = text
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
      .replace(/ /g, "-");
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };
}

export interface DocHeading {
  depth: number;
  text: string;
  id: string;
}

const isRemote = (url: string) => /^[a-z][a-z0-9+.-]*:|^\/\//i.test(url);

/** Every relative target resolved: on this site when it is an imported doc, else GitHub. */
function resolveUrl(url: string, page: DocPage, anchorsOn: (doc: DocPage) => Set<string>, pin: DarkroomPin): string {
  const links = darkroomLinks(pin);
  if (isRemote(url)) return url;
  if (url.startsWith("#")) return anchorsOn(page).has(url.slice(1)) ? url : `${links.blob(page.file)}${url}`;
  const [path, anchor] = url.split("#", 2);
  // `/x` is darkroom's repo root, as on GitHub (and as `vendoredImage` reads it), never this site's.
  const target = path.startsWith("/") ? posix.normalize(path.slice(1)) : posix.normalize(posix.join(posix.dirname(page.file), path));
  if (target.startsWith("../")) {
    // A sibling repo in the suite's checkout layout: `../argus-safelight/spec.md`.
    const [repo, ...rest] = target.slice(3).split("/");
    return `https://github.com/${pin.repo.split("/")[0]}/${repo}/blob/dev/${rest.join("/")}${anchor ? `#${anchor}` : ""}`;
  }
  const imported = DOC_PAGES.find((doc) => doc.file === target);
  if (imported && (!anchor || anchorsOn(imported.file === page.file ? page : imported).has(anchor))) return docsHref(imported, anchor);
  return `${links.blob(target)}${anchor ? `#${anchor}` : ""}`;
}

/** An image's path in the vendored copy, or null when it cannot load there: remote, or outside darkroom's repo. */
function vendoredImage(url: string, page: DocPage): string | null {
  if (isRemote(url)) return null;
  const path = url.startsWith("/") ? posix.normalize(url.slice(1)) : posix.normalize(posix.join(posix.dirname(page.file), url));
  return path === ".." || path.startsWith("../") ? null : `/docs/darkroom/${path}`;
}

function walk(node: Nodes, visit: (node: Nodes, parent: Nodes | null) => void, parent: Nodes | null = null) {
  visit(node, parent);
  if ("children" in node) for (const child of [...(node.children as Nodes[])]) walk(child, visit, node);
}

const remove = (node: Nodes, parent: Nodes) => (parent as { children: Nodes[] }).children.splice((parent as { children: Nodes[] }).children.indexOf(node), 1);

/** Drops the `#` title and the sections a page leaves out, and gives every kept heading GitHub's id. */
function prune(tree: Root, page: DocPage): Map<Heading, string> {
  const slug = slugger();
  const ids = new Map<Heading, string>();
  walk(tree, (node) => {
    if (node.type === "heading") ids.set(node, slug(textOf(node)));
  });

  let keep = page.sections === null;
  const children: RootContent[] = [];
  for (const node of tree.children) {
    if (node.type === "heading" && node.depth === 1) continue;
    if (node.type === "heading" && node.depth === 2 && page.sections !== null) keep = (page.sections as readonly string[]).includes(textOf(node));
    if (keep) children.push(node);
  }
  tree.children = children;

  const kept = new Map<Heading, string>();
  walk(tree, (node) => {
    if (node.type === "heading") kept.set(node, ids.get(node)!);
  });
  return kept;
}

/**
 * The remark plugin for one page. Returns the headings it kept, for the page's contents list. `read` gives another
 * imported page's markdown, so a link into it keeps its anchor only when that page kept the section.
 */
export function darkroomDoc(page: DocPage, pin: DarkroomPin = DARKROOM, read: (page: DocPage) => string = readDoc) {
  const headings: DocHeading[] = [];
  const plugin = function (this: Processor) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the processor parses the other pages the same way
    const processor = this;
    return (tree: Root) => {
      for (const [node, id] of prune(tree, page)) {
        node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id } };
        headings.push({ depth: node.depth, text: textOf(node), id });
      }
      const anchors = new Map<string, Set<string>>([[page.file, new Set(headings.map((heading) => heading.id))]]);
      const anchorsOn = (doc: DocPage): Set<string> => {
        if (!anchors.has(doc.file)) anchors.set(doc.file, new Set(prune(processor.parse(read(doc)) as Root, doc).values()));
        return anchors.get(doc.file)!;
      };

      // A definition an image refers to is an image's source, not a link.
      const imageIds = new Set<string>();
      const definitions = new Map<string, Definition>();
      walk(tree, (node) => {
        if (node.type === "imageReference") imageIds.add(node.identifier);
        if (node.type === "definition") definitions.set(node.identifier, node);
      });
      const dropped = new Set<string>();
      for (const [identifier, definition] of definitions) {
        if (!imageIds.has(identifier)) continue;
        const vendored = vendoredImage(definition.url, page);
        if (vendored) definition.url = vendored;
        else dropped.add(identifier);
      }

      walk(tree, (node, parent) => {
        if (node.type === "link" || (node.type === "definition" && !imageIds.has(node.identifier))) (node as Link).url = resolveUrl(node.url, page, anchorsOn, pin);
        if (node.type === "image" && parent && "children" in parent) {
          const vendored = vendoredImage((node as Image).url, page);
          if (vendored) (node as Image).url = vendored;
          else remove(node, parent);
        }
        if (node.type === "imageReference" && parent && "children" in parent && (dropped.has(node.identifier) || !definitions.has(node.identifier))) remove(node, parent);
      });
      // A badge's link is empty once its image is gone.
      walk(tree, (node, parent) => {
        if ((node.type === "link" || node.type === "linkReference") && node.children.length === 0 && parent && "children" in parent) remove(node, parent);
      });
    };
  };
  return { plugin, headings };
}

/** The page's headings, worked out before it renders, for its contents list and the anchor test. */
export async function docHeadings(page: DocPage, markdown: string = readDoc(page), pin: DarkroomPin = DARKROOM): Promise<DocHeading[]> {
  const [{ unified }, { default: remarkParse }, { default: remarkGfm }] = await Promise.all([import("unified"), import("remark-parse"), import("remark-gfm")]);
  const doc = darkroomDoc(page, pin);
  const processor = unified().use(remarkParse).use(remarkGfm).use(doc.plugin);
  await processor.run(processor.parse(markdown));
  return doc.headings;
}
