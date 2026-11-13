/**
 * darkroom's docs, as committed under `content/darkroom/` by `npm run darkroom:pull`, turned into a page at render
 * time on the server. Nothing is fetched at runtime and nothing is injected as HTML: the markdown becomes React
 * elements (react-markdown, no rehype-raw), so the page needs no CSP source it does not already have.
 *
 * The transforms, in one remark pass:
 * - the `#` title goes (the page has its own), and for a page with `sections` only those `##` sections stay;
 * - every heading gets GitHub's id, counted over the whole file so a deep link means what it means on GitHub;
 * - links to another imported doc stay on this site, links into darkroom's repo go to GitHub at the pinned commit,
 *   `../<sibling>/...` goes to that sibling's `dev`, and an anchor whose section was left out goes to GitHub;
 * - remote images (badges) are dropped, since `img-src` would block them; relative ones load from the vendored copy.
 * Raw HTML is skipped by the renderer.
 */
import { readFileSync } from "node:fs";
import { join, posix } from "node:path";

import type { Heading, Image, Link, Nodes, Root, RootContent } from "mdast";

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
function resolveUrl(url: string, page: DocPage, kept: Set<string>, pin: DarkroomPin): string {
  const links = darkroomLinks(pin);
  if (isRemote(url) || url.startsWith("/")) return url;
  if (url.startsWith("#")) return kept.has(url.slice(1)) ? url : `${links.blob(page.file)}${url}`;
  const [path, anchor] = url.split("#", 2);
  const target = posix.normalize(posix.join(posix.dirname(page.file), path));
  if (target.startsWith("../")) {
    // A sibling repo in the suite's checkout layout: `../argus-safelight/spec.md`.
    const [repo, ...rest] = target.slice(3).split("/");
    return `https://github.com/${pin.repo.split("/")[0]}/${repo}/blob/dev/${rest.join("/")}${anchor ? `#${anchor}` : ""}`;
  }
  const imported = DOC_PAGES.find((doc) => doc.file === target);
  if (imported && (!anchor || imported !== page || kept.has(anchor))) return docsHref(imported, anchor);
  return `${links.blob(target)}${anchor ? `#${anchor}` : ""}`;
}

function walk(node: Nodes, visit: (node: Nodes, parent: Nodes | null) => void, parent: Nodes | null = null) {
  visit(node, parent);
  if ("children" in node) for (const child of [...(node.children as Nodes[])]) walk(child, visit, node);
}

/** The remark plugin for one page. Returns the headings it kept, for the page's contents list. */
export function darkroomDoc(page: DocPage, pin: DarkroomPin = DARKROOM) {
  const headings: DocHeading[] = [];
  const plugin = () => (tree: Root) => {
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

    walk(tree, (node) => {
      if (node.type !== "heading") return;
      const id = ids.get(node)!;
      node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id } };
      headings.push({ depth: node.depth, text: textOf(node), id });
    });
    const kept = new Set(headings.map((heading) => heading.id));

    walk(tree, (node, parent) => {
      if (node.type === "link" || node.type === "definition") (node as Link).url = resolveUrl(node.url, page, kept, pin);
      if (node.type === "image" && parent && "children" in parent) {
        const image = node as Image;
        if (isRemote(image.url)) {
          (parent.children as Nodes[]).splice((parent.children as Nodes[]).indexOf(node), 1);
        } else {
          image.url = `/docs/darkroom/${posix.normalize(posix.join(posix.dirname(page.file), image.url))}`;
        }
      }
    });
    // A badge's link is empty once its image is gone.
    walk(tree, (node, parent) => {
      if (node.type === "link" && node.children.length === 0 && parent && "children" in parent) {
        (parent.children as Nodes[]).splice((parent.children as Nodes[]).indexOf(node), 1);
      }
    });
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
