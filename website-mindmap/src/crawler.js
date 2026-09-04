import * as cheerio from "cheerio";

const USER_AGENT =
  "WebsiteMindMapBot/1.0 (+educational layout visualizer; respects robots.txt)";

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
  "p",
  "img",
  "button",
  "td",
  "th",
  "tr",
  "dt",
  "dd",
]);

const SKIP_LINK_EXT =
  /\.(pdf|jpg|jpeg|png|gif|svg|zip|rar|mp4|mp3|wav|css|js|ico|webp|woff2?|ttf|eot|xml|json)$/i;

const LAYOUT_MAX_DEPTH = 6;

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

function normalizeUrl(rawUrl) {
  const u = new URL(rawUrl);
  u.hash = "";
  let str = u.toString();
  if (str.endsWith("/") && str !== `${u.origin}/`) str = str.slice(0, -1);
  return str;
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

  const firstHeading = $el.children("h1,h2,h3,h4,h5,h6").first();
  if (firstHeading.length) {
    const t = textSnippet(firstHeading, $, 60);
    if (t) return t;
  }
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
  const node = { id: idGen(), tag, name: nodeLabel(tag, el, $) };

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

async function buildPageNode(url, html, idGen) {
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim() || url;
  const body = $("body").get(0);
  const children = [];
  if (body) {
    for (const child of $(body).children().toArray()) {
      const s = summarizeElement($, child, 0, idGen);
      if (s) children.push(s);
    }
  }
  return {
    id: idGen(),
    tag: "page",
    name: title,
    url,
    children: groupChildren(children),
  };
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

export async function analyzeSite(startUrlRaw, opts = {}, onProgress = () => {}) {
  const maxPages = Math.min(Math.max(opts.maxPages ?? 12, 1), 30);
  const maxDepth = Math.min(Math.max(opts.maxDepth ?? 2, 0), 3);

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

    const pageNode = await buildPageNode(url, html, idGen);
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
    },
  };

  onProgress({ type: "done", pagesCrawled: pages.length, nodeCount: countNodes(tree) });
  return tree;
}
