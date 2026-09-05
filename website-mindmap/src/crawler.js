import * as cheerio from "cheerio";

const USER_AGENT =
  "WebsiteMindMapBot/1.0 (+educational site-structure discovery; respects robots.txt)";

const SKIP_LINK_EXT =
  /\.(pdf|jpg|jpeg|png|gif|svg|zip|rar|mp4|mp3|wav|css|js|ico|webp|woff2?|ttf|eot|xml|json)$/i;

// An <a> whose href is purely a same-page fragment (#section) is an in-page
// jump link — a "bookmark" — rather than navigation to another resource, so
// it's surfaced as its own element type in the map, in both crawl modes.
function isBookmarkHref(href) {
  if (!href) return false;
  const trimmed = href.trim();
  return trimmed === "#" || /^#./.test(trimmed);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

const DEFAULT_DOCUMENT_NAMES = [
  "index.html",
  "index.htm",
  "index.php",
  "index.asp",
  "index.aspx",
  "default.html",
  "default.htm",
  "default.asp",
  "default.aspx",
  "home.html",
  "home.htm",
];

function isDefaultDocumentName(name) {
  return DEFAULT_DOCUMENT_NAMES.some((n) => n.toLowerCase() === name.toLowerCase());
}

// "/foo/index.html" and "/foo/" (or "/foo") point at the same resource on
// most servers — collapsing them to one form keeps the crawl queue and
// visited-set from treating a page as "new" just because it was linked to
// under its explicit default-document filename somewhere else on the site.
function stripDefaultDocument(pathname) {
  const idx = pathname.lastIndexOf("/");
  const last = pathname.slice(idx + 1);
  if (last && isDefaultDocumentName(last)) return pathname.slice(0, idx + 1);
  return pathname;
}

function normalizeUrl(rawUrl) {
  const u = new URL(rawUrl);
  u.hash = "";
  u.pathname = stripDefaultDocument(u.pathname);
  let str = u.toString();
  if (str.endsWith("/") && str !== `${u.origin}/`) str = str.slice(0, -1);
  return str;
}

// A bare directory URL ("/", "/blog/") is displayed using its actual
// default-document filename rather than the bare path — preferring a
// same-directory <link rel="canonical"> hint from the page itself (the
// standards-based way a site declares this, e.g. ASP.NET sites often
// canonicalize to "/Default.aspx"), and otherwise falling back to the
// universal "index.html" convention.
function resolveDisplayUrl(fetchedUrl, $) {
  const u = new URL(fetchedUrl);
  const idx = u.pathname.lastIndexOf("/");
  const last = u.pathname.slice(idx + 1);
  if (last) return u.toString(); // already has an explicit filename

  const dir = u.pathname; // ends in "/"
  const canonicalHref = $('link[rel="canonical"]').first().attr("href");
  if (canonicalHref) {
    try {
      const canonical = new URL(canonicalHref, fetchedUrl);
      const cIdx = canonical.pathname.lastIndexOf("/");
      const cDir = canonical.pathname.slice(0, cIdx + 1);
      const cLast = canonical.pathname.slice(cIdx + 1);
      if (canonical.hostname === u.hostname && cDir === dir && cLast && isDefaultDocumentName(cLast)) {
        canonical.hash = "";
        return canonical.toString();
      }
    } catch {
      /* ignore malformed canonical href */
    }
  }

  u.pathname = `${dir}index.html`;
  return u.toString();
}

async function getDisallowedPaths(origin) {
  try {
    const res = await fetchWithTimeout(`${origin}/robots.txt`, 5000);
    if (!res.ok) return [];
    const text = await res.text();
    const lines = text.split("\n");
    let applies = false;
    const disallows = [];
    for (const raw of lines) {
      const line = raw.split("#")[0].trim();
      if (!line) continue;
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim().toLowerCase();
      const val = line.slice(idx + 1).trim();
      if (key === "user-agent") applies = val === "*";
      else if (key === "disallow" && applies) {
        if (val) disallows.push(val);
      }
    }
    return disallows;
  } catch {
    return [];
  }
}

function isDisallowed(pathname, disallows) {
  return disallows.some((p) => p && pathname.startsWith(p));
}

function textSnippet($el, $, max = 60) {
  const text = $el.clone().children().remove().end().text().replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function extractLinks($, baseUrl) {
  const origin = new URL(baseUrl);
  const links = new Set();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || /^(mailto:|tel:|javascript:|#)/i.test(href.trim())) return;
    let abs;
    try {
      abs = new URL(href, baseUrl);
    } catch {
      return;
    }
    if (abs.hostname !== origin.hostname) return;
    if (!/^https?:$/.test(abs.protocol)) return;
    if (SKIP_LINK_EXT.test(abs.pathname)) return;
    try {
      links.add(normalizeUrl(abs.toString()));
    } catch {
      /* ignore malformed */
    }
  });
  return [...links];
}

function countNodes(node) {
  if (!node) return 0;
  let count = 1;
  if (node.children) {
    for (const c of node.children) count += countNodes(c);
  }
  return count;
}

// ============================================================
// Mode: "sitemap" — discover pages and what each one links to
// (internal links, external links, in-page bookmarks), HTTrack-style.
// ============================================================

const MAX_LINKS_PER_PAGE = 80;

function linkLabel($el, $, absUrl) {
  const text = textSnippet($el, $, 60);
  if (text) return text;
  const aria = ($el.attr("aria-label") || "").trim();
  if (aria) return aria;
  const title = ($el.attr("title") || "").trim();
  if (title) return title;
  const rest = `${absUrl.pathname}${absUrl.search}${absUrl.hash}`;
  return rest && rest !== "/" ? rest : absUrl.hostname;
}

// "PointCue-Product-Page.html" -> "Point Cue Product Page"
function humanizeSlug(str) {
  const words = str
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "";
  return words.map((w) => (w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}

function urlHint(absUrl) {
  const segments = absUrl.pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1] || "";
  return humanizeSlug(last) || absUrl.hostname;
}

// Sites often reuse the same generic anchor text ("Product Page", "Read more")
// for links that actually go to different destinations (e.g. one per item in
// a grid). Deduping by URL correctly keeps those as separate nodes, but they
// still need distinguishable labels — so when two+ links on the same page
// share an identical label but point somewhere different, each gets a hint
// from its own URL appended, the same way a bare "strong" tag gets its real
// text instead of being left uninformative.
function disambiguateLabels(nodes) {
  const byLabel = new Map();
  nodes.forEach((n) => {
    if (!byLabel.has(n.name)) byLabel.set(n.name, []);
    byLabel.get(n.name).push(n);
  });
  byLabel.forEach((group) => {
    if (group.length < 2) return;
    group.forEach((n) => {
      let abs;
      try {
        abs = new URL(n.url);
      } catch {
        return;
      }
      const hint = urlHint(abs);
      if (!hint) return;
      // If the URL-derived hint already contains the original label (e.g.
      // "PointCue-Product-Page.html" -> "Point Cue Product Page" for a link
      // literally titled "Product Page"), the hint alone is the clean,
      // non-redundant result. Otherwise keep both for context.
      n.name = hint.toLowerCase().includes(n.name.toLowerCase()) ? hint : `${n.name} — ${hint}`;
    });
  });
}

// Same href appearing more than once on a page collapses into one node with
// a count, instead of repeating a nav/footer link dozens of times.
function buildPageLinks($, pageUrl, siteHostname, idGen) {
  const seen = new Map();
  const order = [];

  $("a[href]").each((_, el) => {
    const $el = $(el);
    const href = $el.attr("href");
    if (!href || /^(mailto:|tel:|javascript:)/i.test(href.trim())) return;

    const isBookmark = isBookmarkHref(href);
    let abs;
    try {
      abs = new URL(href, pageUrl);
    } catch {
      return;
    }
    if (!isBookmark && !/^https?:$/.test(abs.protocol)) return;

    const key = isBookmark ? `#${abs.hash}` : abs.toString();
    const existing = seen.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }
    if (order.length >= MAX_LINKS_PER_PAGE) return;

    const tag = isBookmark ? "bookmark" : abs.hostname === siteHostname ? "link" : "external-link";
    const node = { id: idGen(), tag, name: linkLabel($el, $, abs), url: abs.toString(), count: 1 };
    seen.set(key, node);
    order.push(node);
  });

  disambiguateLabels(order);

  return order.map((n) => ({
    id: n.id,
    tag: n.tag,
    name: n.count > 1 ? `${n.name} (×${n.count})` : n.name,
    url: n.url,
  }));
}

function buildSitemapPageNode($, url, siteHostname, idGen) {
  return buildPageLinks($, url, siteHostname, idGen);
}

// ============================================================
// Mode: "layout" — summarize each page's DOM/layout structure
// (headers, sections, headings, lists, links, images, …).
// ============================================================

const CONTAINER_TAGS = new Set([
  "header",
  "nav",
  "main",
  "section",
  "article",
  "aside",
  "footer",
  "form",
  "div",
  "ul",
  "ol",
  "table",
  "figure",
  "dl",
  // <details> wraps real content (a <summary> plus a body) — treating it as
  // a container surfaces that content instead of swallowing it as one
  // unlabeled blob.
  "details",
]);

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

const SKIP_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "svg",
  "path",
  "link",
  "meta",
  "br",
  "template",
  "head",
]);

const GROUPABLE_TAGS = new Set([
  "li",
  "a",
  "bookmark",
  "p",
  "img",
  "button",
  "td",
  "th",
  "tr",
  "dt",
  "dd",
]);

const LAYOUT_MAX_DEPTH = 6;

function nodeLabel(tag, el, $) {
  const $el = $(el);
  const aria = $el.attr("aria-label");
  if (aria && aria.trim()) return aria.trim();

  if (HEADING_TAGS.has(tag)) return textSnippet($el, $, 80) || tag.toUpperCase();
  if (tag === "img") return $el.attr("alt")?.trim() || "Image";
  if (tag === "a") return textSnippet($el, $, 40) || $el.attr("href") || "Link";
  if (tag === "button") return textSnippet($el, $, 40) || "Button";
  if (tag === "input") return `Input (${$el.attr("type") || "text"})`;
  if (tag === "li") return textSnippet($el, $, 50) || "List item";
  if (tag === "td" || tag === "th") return textSnippet($el, $, 40) || tag.toUpperCase();
  if (tag === "p" || tag === "dt" || tag === "dd") return textSnippet($el, $, 70) || "Paragraph";
  if (tag === "summary") return textSnippet($el, $, 60) || "Summary";

  const firstHeading = $el.children("h1,h2,h3,h4,h5,h6").first();
  if (firstHeading.length) {
    const t = textSnippet(firstHeading, $, 60);
    if (t) return t;
  }

  // Catch-all for tags with no special case above (strong, em, b, i, code,
  // mark, cite, time, label, …) — show their actual text instead of falling
  // straight to the bare tag name, which carries no information at all.
  const generic = textSnippet($el, $, 50);
  if (generic) return generic;

  const id = $el.attr("id");
  if (id) return `${tag} #${id}`;
  const cls = ($el.attr("class") || "").split(/\s+/).filter(Boolean)[0];
  if (cls) return `${tag}.${cls}`;
  return tag;
}

function groupChildren(children) {
  const result = [];
  let i = 0;
  while (i < children.length) {
    const c = children[i];
    if (GROUPABLE_TAGS.has(c.tag) && !c.children) {
      let j = i;
      const samples = [];
      while (j < children.length && children[j].tag === c.tag && !children[j].children) {
        samples.push(children[j]);
        j += 1;
      }
      if (samples.length > 4) {
        result.push({
          id: `${c.id}-group`,
          tag: `${c.tag}-group`,
          name: `${samples.length} × ${c.tag}`,
          count: samples.length,
          children: samples.slice(0, 3),
        });
        i = j;
        continue;
      }
    }
    result.push(c);
    i += 1;
  }
  return result;
}

function summarizeElement($, el, depth, idGen) {
  const tag = el.tagName?.toLowerCase();
  if (!tag || SKIP_TAGS.has(tag)) return null;
  const $el = $(el);

  const isContainer = CONTAINER_TAGS.has(tag);
  const nodeTag = tag === "a" && isBookmarkHref($el.attr("href")) ? "bookmark" : tag;
  const node = { id: idGen(), tag: nodeTag, name: nodeLabel(tag, el, $) };

  if (!isContainer) return node;

  const directChildren = $el.children().toArray();
  if (!directChildren.length) return node;

  if (depth >= LAYOUT_MAX_DEPTH) {
    node.name = `${node.name} (+${directChildren.length})`;
    return node;
  }

  const summarized = [];
  for (const child of directChildren) {
    const s = summarizeElement($, child, depth + 1, idGen);
    if (s) summarized.push(s);
  }
  const grouped = groupChildren(summarized);
  if (grouped.length) node.children = grouped;
  return node;
}

function buildLayoutPageNode($, idGen) {
  const body = $("body").get(0);
  const children = [];
  if (body) {
    for (const child of $(body).children().toArray()) {
      const s = summarizeElement($, child, 0, idGen);
      if (s) children.push(s);
    }
  }
  return groupChildren(children);
}

// ============================================================

async function buildPageNode(url, html, siteHostname, mode, idGen) {
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim() || url;
  const displayUrl = resolveDisplayUrl(url, $);
  const children =
    mode === "layout" ? buildLayoutPageNode($, idGen) : buildSitemapPageNode($, displayUrl, siteHostname, idGen);
  return { id: idGen(), tag: "page", name: title, url: displayUrl, children };
}

export async function analyzeSite(startUrlRaw, opts = {}, onProgress = () => {}) {
  const maxPages = Math.min(Math.max(opts.maxPages ?? 12, 1), 30);
  const maxDepth = Math.min(Math.max(opts.maxDepth ?? 2, 0), 3);
  const mode = opts.mode === "layout" ? "layout" : "sitemap";

  let start;
  try {
    start = new URL(startUrlRaw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (!/^https?:$/.test(start.protocol)) {
    throw new Error("URL must start with http:// or https://");
  }

  const origin = start.origin;
  const disallows = await getDisallowedPaths(origin);

  let idCounter = 0;
  const idGen = () => `n${idCounter++}`;

  const startNorm = normalizeUrl(start.toString());
  const visited = new Set();
  const queue = [{ url: startNorm, depth: 0 }];
  const pages = [];
  const errors = [];

  while (queue.length && pages.length < maxPages) {
    const { url, depth } = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    const u = new URL(url);
    if (isDisallowed(u.pathname, disallows)) {
      onProgress({ type: "skip", url, reason: "robots.txt" });
      continue;
    }

    onProgress({ type: "fetching", url, index: pages.length + 1, total: maxPages });

    let html;
    try {
      const res = await fetchWithTimeout(url, 9000);
      const ct = res.headers.get("content-type") || "";
      if (!res.ok) {
        errors.push({ url, error: `HTTP ${res.status}` });
        onProgress({ type: "error", url, error: `HTTP ${res.status}` });
        continue;
      }
      if (!ct.includes("text/html")) {
        onProgress({ type: "skip", url, reason: "not html" });
        continue;
      }
      html = await res.text();
    } catch (err) {
      errors.push({ url, error: err.message });
      onProgress({ type: "error", url, error: err.message });
      continue;
    }

    const pageNode = await buildPageNode(url, html, start.hostname, mode, idGen);
    pages.push(pageNode);
    onProgress({ type: "parsed", url, nodeCount: countNodes(pageNode) });

    if (depth < maxDepth) {
      const $ = cheerio.load(html);
      const links = extractLinks($, url);
      for (const link of links) {
        if (!visited.has(link) && pages.length + queue.length < maxPages * 3) {
          queue.push({ url: link, depth: depth + 1 });
        }
      }
    }

    if (queue.length) await delay(200);
  }

  const tree = {
    id: "root",
    tag: "site",
    name: start.hostname,
    url: origin,
    children: pages,
    meta: {
      crawledAt: new Date().toISOString(),
      pagesCrawled: pages.length,
      pagesAttempted: visited.size,
      errors,
      mode,
    },
  };

  onProgress({ type: "done", pagesCrawled: pages.length, nodeCount: countNodes(tree) });
  return tree;
}
