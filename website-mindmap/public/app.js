(() => {
  "use strict";

  const COLORS = {
    site: "#f6c945",
    page: "#5aa9ff",
    header: "#8f8fd8",
    nav: "#8f8fd8",
    footer: "#8f8fd8",
    main: "#57d9a3",
    section: "#57d9a3",
    article: "#57d9a3",
    aside: "#57d9a3",
    form: "#57d9a3",
    h1: "#ff8a5c",
    h2: "#ff8a5c",
    h3: "#ff8a5c",
    h4: "#ff8a5c",
    h5: "#ff8a5c",
    h6: "#ff8a5c",
    ul: "#c58aff",
    ol: "#c58aff",
    table: "#c58aff",
    dl: "#c58aff",
    figure: "#c58aff",
    div: "#7fa0c9",
    a: "#4dd0e1",
    link: "#4dd0e1",
    "external-link": "#ff9f43",
    bookmark: "#ff6fae",
    img: "#ffb454",
    button: "#8bc34a",
    input: "#8bc34a",
    error: "#ff5c5c",
    default: "#9aa5b1",
  };

  function colorFor(tag) {
    if (!tag) return COLORS.default;
    const base = tag.replace(/-group$/, "");
    return COLORS[base] || COLORS.default;
  }

  function baseRadius(tag) {
    if (tag === "site") return 15;
    if (tag === "page") return 10;
    if (/-group$/.test(tag)) return 8;
    if (
      ["header", "nav", "main", "section", "article", "aside", "footer", "form"].includes(tag)
    )
      return 7.5;
    if (/^h[1-6]$/.test(tag)) return 6.5;
    return 5;
  }

  function friendlyTag(tag) {
    if (tag.endsWith("-group")) return `group of ${tag.replace("-group", "")}`;
    const map = {
      h1: "Heading 1",
      h2: "Heading 2",
      h3: "Heading 3",
      h4: "Heading 4",
      h5: "Heading 5",
      h6: "Heading 6",
      bookmark: "Bookmark",
      link: "Link",
      "external-link": "External link",
    };
    return map[tag] || tag;
  }

  // ---------- friendly names ----------
  // Node names come straight from the crawled markup (tag names, class names,
  // ids) so raw labels like "main.flex" or "SellCatalogue" are common. This
  // turns those into plain-language guesses while leaving real text content
  // (headings, link/button text, paragraphs) untouched since it's already readable.
  const GENERIC_LABELS = {
    div: "Section",
    span: "Text",
    main: "Main content",
    section: "Section",
    article: "Article",
    aside: "Sidebar",
    header: "Header",
    footer: "Footer",
    nav: "Navigation",
    form: "Form",
    ul: "List",
    ol: "List",
    table: "Table",
    dl: "List",
    figure: "Figure",
  };

  // "5 × li" -> "5 list items"
  const PLURAL_LABELS = {
    li: "list items",
    a: "links",
    p: "paragraphs",
    img: "images",
    button: "buttons",
    td: "cells",
    th: "cells",
    tr: "rows",
    dt: "terms",
    dd: "descriptions",
  };

  function humanizeIdentifier(str) {
    const words = str
      .replace(/[-_]+/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .split(/\s+/)
      .filter(Boolean);
    if (!words.length) return "";
    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  // A single humanized word (e.g. "flex", "wrapper") is usually a styling hook,
  // not real content, so it's shown as a hint alongside the plain-English tag
  // name rather than standing in for it. A multi-word result (e.g.
  // "SellCatalogue" -> "Sell Catalogue") usually *is* meaningful on its own.
  function friendlyName(d) {
    const tag = d.data.tag;
    const name = d.data.name || "";
    if (tag === "site" || tag === "page" || !name) return name;

    const baseTag = tag.replace(/-group$/, "");
    const genericLabel = GENERIC_LABELS[baseTag] || friendlyTag(tag);

    if (name === tag) return genericLabel;

    const groupMatch = name.match(/^(\d+) × ([\w-]+)$/);
    if (groupMatch) {
      const [, count, groupTag] = groupMatch;
      return `${count} ${PLURAL_LABELS[groupTag] || `${groupTag} elements`}`;
    }

    const idMatch = name.match(/^[\w-]+#(.+)$/);
    const clsMatch = !idMatch && name.match(/^[\w-]+\.(.+)$/);
    const identifier = idMatch?.[1] ?? clsMatch?.[1];
    if (identifier) {
      const humanized = humanizeIdentifier(identifier);
      if (!humanized) return name;
      const isSingleWord = !humanized.includes(" ");
      return isSingleWord ? `${genericLabel} (${humanized})` : humanized;
    }

    return name;
  }

  let friendlyNamesOn = false;
  try {
    friendlyNamesOn = localStorage.getItem("website-mindmap-friendly-names") === "1";
  } catch {
    /* storage may be unavailable */
  }

  function displayName(d) {
    return friendlyNamesOn ? friendlyName(d) : d.data.name;
  }

  let showUrlsOn = false;
  try {
    showUrlsOn = localStorage.getItem("website-mindmap-show-urls") === "1";
  } catch {
    /* storage may be unavailable */
  }

  function pathLabel(url) {
    let path;
    try {
      const u = new URL(url);
      path = `${u.pathname}${u.search}` || "/";
    } catch {
      path = url;
    }
    const max = 32;
    return path.length > max ? `${path.slice(0, max - 1)}…` : path;
  }

  // ---------- DOM refs ----------
  const $ = (sel) => document.querySelector(sel);
  const form = $("#analyze-form");
  const urlInput = $("#url-input");
  const advancedToggle = $("#advanced-toggle");
  const advancedPanel = $("#advanced-panel");
  const optCrawlMode = $("#opt-crawl-mode");
  const optMaxPages = $("#opt-max-pages");
  const optMaxDepth = $("#opt-max-depth");
  const emptyState = $("#empty-state");
  const progressPanel = $("#progress-panel");
  const progressHeadline = $("#progress-headline");
  const progressLog = $("#progress-log");
  const canvasWrap = $("#canvas-wrap");
  const searchInput = $("#search-input");
  const resetViewBtn = $("#reset-view-btn");
  const expandAllBtn = $("#expand-all-btn");
  const expandNextBtn = $("#expand-next-btn");
  const collapseAllBtn = $("#collapse-all-btn");
  const friendlyNamesBtn = $("#friendly-names-btn");
  const showUrlsBtn = $("#show-urls-btn");
  const legendToggleBtn = $("#legend-toggle-btn");
  const reportBtn = $("#report-btn");
  const legendEl = $("#legend");
  const tooltipEl = $("#tooltip");
  const breadcrumbEl = $("#breadcrumb");
  const statsEl = $("#stats");
  const themeSelect = $("#theme-select");
  const styleSelect = $("#style-select");
  const nodeShapeSelect = $("#node-shape-select");

  // ---------- theme ----------
  const THEME_STORAGE_KEY = "website-mindmap-theme";
  const THEMES = new Set(["auto", "dark", "light", "midnight", "aurora"]);
  const prefersDarkMq = window.matchMedia("(prefers-color-scheme: dark)");

  function readStoredTheme() {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      return THEMES.has(stored) ? stored : "auto";
    } catch {
      return "auto";
    }
  }

  function resolveTheme(pref) {
    if (pref === "auto") return prefersDarkMq.matches ? "dark" : "light";
    return pref;
  }

  function applyTheme(pref) {
    document.documentElement.setAttribute("data-theme", resolveTheme(pref));
  }

  function setTheme(pref) {
    const next = THEMES.has(pref) ? pref : "auto";
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* storage may be unavailable (private mode, disabled cookies) */
    }
    applyTheme(next);
    if (themeSelect) themeSelect.value = next;
  }

  const initialTheme = readStoredTheme();
  applyTheme(initialTheme);
  if (themeSelect) {
    themeSelect.value = initialTheme;
    themeSelect.addEventListener("change", (e) => setTheme(e.target.value));
  }
  prefersDarkMq.addEventListener("change", () => {
    if (readStoredTheme() === "auto") applyTheme("auto");
  });

  // ---------- drawing style ----------
  // A style other than "clean" swaps in its own full palette (see styles.css)
  // and layers an SVG filter (wobble/glow/tint) over the links + nodes layer.
  const STYLE_STORAGE_KEY = "website-mindmap-style";
  const STYLES = new Set(["clean", "sketch", "pencil", "neon", "blueprint"]);

  function readStoredStyle() {
    try {
      const stored = localStorage.getItem(STYLE_STORAGE_KEY);
      return STYLES.has(stored) ? stored : "clean";
    } catch {
      return "clean";
    }
  }

  function applyStyle(style) {
    document.documentElement.setAttribute("data-style", style);
  }

  function setStyle(style) {
    const next = STYLES.has(style) ? style : "clean";
    try {
      localStorage.setItem(STYLE_STORAGE_KEY, next);
    } catch {
      /* storage may be unavailable (private mode, disabled cookies) */
    }
    applyStyle(next);
    if (styleSelect) styleSelect.value = next;
  }

  const initialStyle = readStoredStyle();
  applyStyle(initialStyle);
  if (styleSelect) {
    styleSelect.value = initialStyle;
    styleSelect.addEventListener("change", (e) => setStyle(e.target.value));
  }

  // ---------- node (bubble) shape ----------
  // "circle" keeps the original look (small dot, label beside it). "rect" and
  // "pill" instead size a box to fit the label and draw the text inside it —
  // see renderLabelInside/sizeShapeToLabel in the rendering section below.
  // Changing shape rebuilds the whole node/link DOM (rebuildNodeShapes) since
  // the two modes use different child elements per node.
  const NODE_SHAPE_STORAGE_KEY = "website-mindmap-node-shape";
  const NODE_SHAPES = new Set(["circle", "rect", "pill"]);
  let nodeShapeOn = "circle";

  function readStoredNodeShape() {
    try {
      const stored = localStorage.getItem(NODE_SHAPE_STORAGE_KEY);
      return NODE_SHAPES.has(stored) ? stored : "circle";
    } catch {
      return "circle";
    }
  }

  function setNodeShape(shape) {
    const next = NODE_SHAPES.has(shape) ? shape : "circle";
    nodeShapeOn = next;
    try {
      localStorage.setItem(NODE_SHAPE_STORAGE_KEY, next);
    } catch {
      /* storage may be unavailable (private mode, disabled cookies) */
    }
    if (nodeShapeSelect) nodeShapeSelect.value = next;
    if (root) rebuildNodeShapes();
  }

  nodeShapeOn = readStoredNodeShape();
  if (nodeShapeSelect) {
    nodeShapeSelect.value = nodeShapeOn;
    nodeShapeSelect.addEventListener("change", (e) => setNodeShape(e.target.value));
  }

  advancedToggle.addEventListener("click", () => {
    const isHidden = advancedPanel.classList.contains("hidden");
    advancedPanel.classList.toggle("hidden");
    advancedToggle.setAttribute("aria-expanded", String(isHidden));
  });

  legendToggleBtn.addEventListener("click", () => legendEl.classList.toggle("hidden"));

  friendlyNamesBtn.setAttribute("aria-pressed", String(friendlyNamesOn));
  friendlyNamesBtn.addEventListener("click", () => {
    friendlyNamesOn = !friendlyNamesOn;
    friendlyNamesBtn.setAttribute("aria-pressed", String(friendlyNamesOn));
    try {
      localStorage.setItem("website-mindmap-friendly-names", friendlyNamesOn ? "1" : "0");
    } catch {
      /* storage may be unavailable */
    }
    if (root) {
      relabelNodes();
      if (focusedId) updateBreadcrumb(root.descendants().find((n) => n.id === focusedId));
      else if (root.data) breadcrumbEl.textContent = root.data.name;
    }
  });

  showUrlsBtn.setAttribute("aria-pressed", String(showUrlsOn));
  showUrlsBtn.addEventListener("click", () => {
    showUrlsOn = !showUrlsOn;
    showUrlsBtn.setAttribute("aria-pressed", String(showUrlsOn));
    try {
      localStorage.setItem("website-mindmap-show-urls", showUrlsOn ? "1" : "0");
    } catch {
      /* storage may be unavailable */
    }
    if (root) relabelNodes();
  });

  // Drives both the #type-filter-options checkboxes and the legend — one
  // source of truth per crawl mode, since "sitemap" and "layout" crawls
  // produce very different tag vocabularies. `activeCategories` switches
  // between them once a crawl's actual mode is known (see the "result"
  // handler below); it starts as the sitemap set to match the default
  // crawl-mode option.
  const SITEMAP_CATEGORIES = [
    { value: "link", label: "Internal links", swatchTag: "link" },
    { value: "external-link", label: "External links", swatchTag: "external-link" },
    { value: "bookmark", label: "Bookmarks", swatchTag: "bookmark" },
  ];

  const LAYOUT_CATEGORIES = [
    { value: "header,nav,footer", label: "Headers / Nav / Footer", swatchTag: "header" },
    { value: "main,section,article,aside", label: "Main / Sections", swatchTag: "main" },
    { value: "h1,h2,h3,h4,h5,h6", label: "Headings", swatchTag: "h1" },
    { value: "ul,ol,table,dl,figure,li,td,th,tr,dt,dd", label: "Lists & Tables", swatchTag: "ul" },
    { value: "a", label: "Links", swatchTag: "a" },
    { value: "bookmark", label: "Bookmarks", swatchTag: "bookmark" },
    { value: "img", label: "Images", swatchTag: "img" },
    { value: "button,form,input", label: "Buttons & Forms", swatchTag: "button" },
    { value: "p,div,span", label: "Paragraphs & Generic", swatchTag: "div" },
    {
      value: "strong,em,b,i,small,mark,code,cite,blockquote,abbr,q,time,address,label,details,summary",
      label: "Text formatting & wrappers",
      swatchTag: "div",
      defaultOff: true,
    },
  ];

  let activeCategories = SITEMAP_CATEGORIES;

  // Rebuilds the checkbox list for whichever category set is active. Change
  // listeners live on the container (event delegation), so they don't need
  // re-wiring each time this regenerates the checkboxes.
  function renderTypeFilterCheckboxes(categories) {
    typeFilterOptionsEl.innerHTML = categories
      .map(
        (c) =>
          `<label><input type="checkbox" class="type-chk" value="${c.value}"${c.defaultOff ? "" : " checked"} /> ${escapeHtml(
            c.label
          )}</label>`
      )
      .join("");
  }

  function isCategoryChecked(category) {
    const chk = document.querySelector(`.type-chk[value="${category.value}"]`);
    return !chk || chk.checked;
  }

  // Rebuilt whenever the element-type filter changes so a deselected type's
  // row disappears along with the nodes it controls. Site/page are always
  // shown since they're not filterable.
  function buildLegend() {
    const entries = [
      ["site", "Website root"],
      ["page", "Page"],
      ...activeCategories.filter(isCategoryChecked).map((c) => [c.swatchTag, c.label]),
    ];
    legendEl.innerHTML =
      '<div class="legend-title">Legend</div>' +
      entries
        .map(
          ([tag, label]) =>
            `<div class="legend-row"><span class="legend-swatch" style="background:${colorFor(
              tag
            )}"></span>${label}</div>`
        )
        .join("");
  }

  function showPanel(which) {
    emptyState.classList.toggle("hidden", which !== "empty");
    progressPanel.classList.toggle("hidden", which !== "progress");
    canvasWrap.classList.toggle("hidden", which !== "canvas");
  }

  function logProgress(text, cls) {
    const li = document.createElement("li");
    if (cls) li.classList.add(cls);
    li.textContent = text;
    progressLog.appendChild(li);
    progressLog.scrollTop = progressLog.scrollHeight;
    while (progressLog.children.length > 60) progressLog.removeChild(progressLog.firstChild);
  }

  // ---------- crawl ----------
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const rawUrl = urlInput.value.trim();
    if (!rawUrl) return;
    let normalized = rawUrl;
    if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
    startAnalysis(normalized);
  });

  let activeSource = null;

  function startAnalysis(url) {
    if (activeSource) {
      activeSource.close();
      activeSource = null;
    }
    showPanel("progress");
    progressLog.innerHTML = "";
    progressHeadline.textContent = `Crawling ${url}…`;

    const params = new URLSearchParams({
      url,
      maxPages: optMaxPages.value || "15",
      maxDepth: optMaxDepth.value || "2",
      mode: optCrawlMode.value === "layout" ? "layout" : "sitemap",
    });
    const es = new EventSource(`/api/analyze?${params.toString()}`);
    activeSource = es;

    es.addEventListener("progress", (ev) => {
      const data = JSON.parse(ev.data);
      if (data.type === "fetching") {
        progressHeadline.textContent = `Fetching page ${data.index}/${data.total}…`;
        logProgress(`→ ${data.url}`);
      } else if (data.type === "parsed") {
        logProgress(`✓ parsed ${data.url} (${data.nodeCount} nodes)`);
      } else if (data.type === "skip") {
        logProgress(`… skipped ${data.url} (${data.reason})`, "skip");
      } else if (data.type === "error") {
        logProgress(`✗ ${data.url} — ${data.error}`, "err");
      } else if (data.type === "done") {
        progressHeadline.textContent = `Building mind map from ${data.pagesCrawled} page(s)…`;
      }
    });

    es.addEventListener("result", (ev) => {
      const tree = JSON.parse(ev.data);
      es.close();
      activeSource = null;
      if (!tree.children || tree.children.length === 0) {
        progressHeadline.textContent = "Couldn't reach any pages on that site.";
        logProgress("Check the URL, or that the site allows automated requests.", "err");
        return;
      }
      lastTreeData = tree;
      activeCategories = tree.meta?.mode === "layout" ? LAYOUT_CATEGORIES : SITEMAP_CATEGORIES;
      renderTypeFilterCheckboxes(activeCategories);
      updateTypeFilterSummary();
      buildLegend();
      renderMindMap(applyTypeFilter(tree));
    });

    es.addEventListener("error", (ev) => {
      let message = "Connection lost while crawling.";
      try {
        message = JSON.parse(ev.data).message || message;
      } catch {
        /* ev.data may be absent on transport-level errors */
      }
      logProgress(`✗ ${message}`, "err");
      progressHeadline.textContent = "Crawl failed.";
      es.close();
      activeSource = null;
    });
  }

  // ---------- mind map rendering ----------
  let svg, zoomLayer, gLinks, gNodes, zoomBehavior, width, height;
  let root; // d3.hierarchy root
  let nodeIdSeq = 0;
  let lastTreeData = null; // pristine crawl result, re-filtered from scratch on every type-filter change

  // ---------- element-type filter ----------
  // Each checkbox's value is a comma-separated list of raw tag names it controls.
  // "site" and "page" nodes are never filterable — only the layout content within pages.
  const typeFilterOptionsEl = $("#type-filter-options");
  const typeFilterSummaryEl = $("#type-filter-summary");

  function getHiddenTags() {
    const hidden = new Set();
    document.querySelectorAll(".type-chk:not(:checked)").forEach((chk) => {
      chk.value.split(",").forEach((t) => hidden.add(t));
    });
    return hidden;
  }

  // Dropping a node doesn't drop what's inside it — its children are spliced
  // into its parent's place, so hiding e.g. "Lists & Tables" unwraps list
  // markup instead of deleting whatever content (links, headings…) was in it.
  function filterNode(node, hidden) {
    const children = [];
    (node.children || []).forEach((child) => {
      const filteredChild = filterNode(child, hidden);
      const baseTag = child.tag.replace(/-group$/, "");
      if (hidden.has(baseTag)) {
        if (filteredChild.children) children.push(...filteredChild.children);
      } else {
        children.push(filteredChild);
      }
    });
    return { ...node, children: children.length ? children : undefined };
  }

  function applyTypeFilter(tree) {
    const hidden = getHiddenTags();
    return hidden.size ? filterNode(tree, hidden) : tree;
  }

  function updateTypeFilterSummary() {
    const all = document.querySelectorAll(".type-chk").length;
    const checked = document.querySelectorAll(".type-chk:checked").length;
    if (checked === all) typeFilterSummaryEl.textContent = "All element types";
    else if (checked === 0) typeFilterSummaryEl.textContent = "No element types";
    else typeFilterSummaryEl.textContent = `${checked} of ${all} element types`;
  }

  // Rebuilds the map from the pristine crawl data with the current filter
  // applied. Resets to the default collapsed-to-pages view since filtering
  // changes the shape of the tree enough that preserving expand state isn't
  // worth the complexity.
  function reapplyTypeFilter() {
    if (!lastTreeData) return;
    const filtered = applyTypeFilter(lastTreeData);
    root = d3.hierarchy(filtered, (d) => d.children);
    root.each((d) => {
      d.id = d.data.id ?? `auto${nodeIdSeq++}`;
    });
    root.x0 = 0;
    root.y0 = 0;
    collapseToPages(root, 0);
    clearFocus();
    update(root, true);
    fitToNode(root, 0);
    updateStats(filtered);
    breadcrumbEl.textContent = filtered.name;
  }

  typeFilterOptionsEl.addEventListener("change", () => {
    updateTypeFilterSummary();
    buildLegend();
    reapplyTypeFilter();
  });
  renderTypeFilterCheckboxes(activeCategories);
  updateTypeFilterSummary();
  buildLegend();

  function initSvgOnce() {
    if (svg) return;
    svg = d3.select("#canvas");
    const defs = svg.append("defs");
    const filter = defs
      .append("filter")
      .attr("id", "glow")
      .attr("x", "-100%")
      .attr("y", "-100%")
      .attr("width", "300%")
      .attr("height", "300%");
    filter.append("feGaussianBlur").attr("stdDeviation", 4).attr("result", "blur");
    const merge = filter.append("feMerge");
    merge.append("feMergeNode").attr("in", "blur");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    // ---- drawing-style filters (applied via CSS on [data-style="…"]) ----
    // Hand-drawn wobble: keeps original tag colors, jitters geometry.
    const sketchFilter = defs
      .append("filter")
      .attr("id", "sketchWobble")
      .attr("x", "-20%")
      .attr("y", "-20%")
      .attr("width", "140%")
      .attr("height", "140%");
    sketchFilter
      .append("feTurbulence")
      .attr("type", "fractalNoise")
      .attr("baseFrequency", "0.012")
      .attr("numOctaves", 2)
      .attr("seed", 7)
      .attr("result", "noise");
    sketchFilter.append("feDisplacementMap").attr("in", "SourceGraphic").attr("in2", "noise").attr("scale", 6);

    // Pencil: subtler wobble plus desaturation, for a graphite-on-paper look.
    const pencilFilter = defs
      .append("filter")
      .attr("id", "pencilTexture")
      .attr("x", "-20%")
      .attr("y", "-20%")
      .attr("width", "140%")
      .attr("height", "140%");
    pencilFilter
      .append("feTurbulence")
      .attr("type", "fractalNoise")
      .attr("baseFrequency", "0.018")
      .attr("numOctaves", 2)
      .attr("seed", 3)
      .attr("result", "noise2");
    pencilFilter
      .append("feDisplacementMap")
      .attr("in", "SourceGraphic")
      .attr("in2", "noise2")
      .attr("scale", 3.5)
      .attr("result", "wobbled");
    pencilFilter.append("feColorMatrix").attr("in", "wobbled").attr("type", "saturate").attr("values", "0.15");

    // Neon: a stronger, double-stacked glow than the default focus glow above.
    const neonFilter = defs
      .append("filter")
      .attr("id", "neonGlow")
      .attr("x", "-150%")
      .attr("y", "-150%")
      .attr("width", "400%")
      .attr("height", "400%");
    neonFilter.append("feGaussianBlur").attr("stdDeviation", 5).attr("result", "blur1");
    const neonMerge = neonFilter.append("feMerge");
    neonMerge.append("feMergeNode").attr("in", "blur1");
    neonMerge.append("feMergeNode").attr("in", "blur1");
    neonMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // Blueprint: desaturate then rotate hue toward blue, unifying the
    // categorical tag colors into one technical-drawing tone.
    const blueprintFilter = defs.append("filter").attr("id", "blueprintTint");
    blueprintFilter.append("feColorMatrix").attr("type", "saturate").attr("values", "0.5").attr("result", "desat");
    blueprintFilter.append("feColorMatrix").attr("in", "desat").attr("type", "hueRotate").attr("values", "190");

    zoomLayer = svg.append("g").attr("class", "zoom-layer");
    gLinks = zoomLayer.append("g").attr("class", "links-layer");
    gNodes = zoomLayer.append("g").attr("class", "nodes-layer");

    zoomBehavior = d3
      .zoom()
      .scaleExtent([0.08, 4])
      .on("zoom", (event) => {
        zoomLayer.attr("transform", event.transform);
        if (root) updateLabelVisibility(event.transform.k);
      });
    svg.call(zoomBehavior);
    svg.on("click", (event) => {
      if (event.target === svg.node()) clearFocus();
    });

    window.addEventListener("resize", () => {
      resizeSvg();
      update(root);
    });
  }

  function resizeSvg() {
    const rect = document.getElementById("canvas-wrap").getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    svg.attr("viewBox", [0, 0, width, height]).attr("width", width).attr("height", height);
  }

  function collapse(d) {
    if (d.children) {
      d._children = d.children;
      d._children.forEach(collapse);
      d.children = null;
    }
  }

  function expandAllNode(d) {
    if (d._children) {
      d.children = d._children;
      d._children = null;
    }
    if (d.children) d.children.forEach(expandAllNode);
  }

  // Reveals one more level everywhere at once, breadth-first: any node
  // that's currently collapsed gets opened, but newly-revealed children stay
  // collapsed rather than cascading all the way down like expandAllNode.
  function expandNextLayer(d) {
    if (d._children) {
      d.children = d._children;
      d._children = null;
      return;
    }
    if (d.children) d.children.forEach(expandNextLayer);
  }

  function collapseToPages(d, depth) {
    if (depth >= 1) {
      collapse(d);
      return;
    }
    if (d.children) d.children.forEach((c) => collapseToPages(c, depth + 1));
  }

  function renderMindMap(data) {
    initSvgOnce();
    showPanel("canvas");
    resizeSvg();

    root = d3.hierarchy(data, (d) => d.children);
    root.each((d) => {
      d.id = d.data.id ?? `auto${nodeIdSeq++}`;
    });
    root.x0 = 0;
    root.y0 = 0;

    // Default: site + pages expanded, everything below collapsed for a clean first view.
    collapseToPages(root, 0);

    update(root, true);
    fitToNode(root, 0);
    updateStats(data);
    breadcrumbEl.textContent = data.name;
  }

  function updateStats(data) {
    const meta = data.meta || {};
    const errCount = (meta.errors || []).length;
    statsEl.textContent = `${meta.pagesCrawled ?? data.children?.length ?? 0} pages · ${
      errCount ? `${errCount} error(s)` : "no errors"
    }`;
  }

  const RADIUS_STEP_MIN = 130;
  const NODE_MARGIN = 16;

  // Offscreen canvas used purely to measure label width before anything is
  // rendered, so ring spacing can be computed from real content up front
  // instead of guessed and fixed up after the fact.
  let measureCtx = null;
  function measureTextWidthPx(text) {
    if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
    measureCtx.font = "11px Inter, -apple-system, BlinkMacSystemFont, sans-serif";
    return measureCtx.measureText(text || "").width;
  }

  // How much room a node actually needs on screen. Circle mode uses a small
  // fixed footprint (dots don't collide even when close); rect/pill mode
  // measures the real label so boxes never overlap regardless of how long a
  // title or URL path turns out to be.
  function nodeFootprint(d) {
    if (nodeShapeOn === "circle") {
      const r = baseRadius(d.data.tag) + 10;
      return { halfWidth: r, height: r * 2 };
    }
    const big = d.data.tag === "site" || d.data.tag === "page";
    const hasPath = showUrlsOn && d.data.tag === "page" && !!d.data.url;
    const titleW = measureTextWidthPx(truncateLabel(d));
    const pathW = hasPath ? measureTextWidthPx(pathLabel(d.data.url)) : 0;
    const w = Math.max(Math.max(titleW, pathW) + 28, big ? 46 : 34);
    const h = Math.max((hasPath ? 2 : 1) * 13 + 16, 26);
    return { halfWidth: w / 2, height: h };
  }

  function layout(rootNode) {
    const tree = d3
      .tree()
      .size([2 * Math.PI, 1])
      .separation((a, b) => {
        const gap =
          nodeFootprint(a).halfWidth + nodeFootprint(b).halfWidth + (a.parent === b.parent ? NODE_MARGIN : NODE_MARGIN * 2);
        return gap / 40;
      });
    tree(rootNode);

    // Angular slots above are only proportionally fair — actual pixel
    // clearance also depends on radius. Push each ring's radius out until
    // every angularly-adjacent pair of nodes in it (wrapping around the full
    // circle) has enough arc length for both footprints, so nodes can never
    // visually overlap no matter how many wide siblings share a ring.
    const byDepth = new Map();
    let maxDepth = 0;
    rootNode.each((d) => {
      if (!byDepth.has(d.depth)) byDepth.set(d.depth, []);
      byDepth.get(d.depth).push(d);
      if (d.depth > maxDepth) maxDepth = d.depth;
    });

    const ringRadius = new Array(maxDepth + 1).fill(0);
    for (let depth = 1; depth <= maxDepth; depth++) {
      const ring = (byDepth.get(depth) || []).slice().sort((a, b) => a.x - b.x);
      let needed = RADIUS_STEP_MIN;
      if (ring.length >= 2) {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i];
          const b = ring[(i + 1) % ring.length];
          const gapAngle = i === ring.length - 1 ? 2 * Math.PI - a.x + b.x : b.x - a.x;
          const req = (nodeFootprint(a).halfWidth + nodeFootprint(b).halfWidth + NODE_MARGIN) / Math.max(gapAngle, 0.0005);
          if (req > needed) needed = req;
        }
      }
      ringRadius[depth] = Math.max(ringRadius[depth - 1] + RADIUS_STEP_MIN, needed);
    }

    rootNode.each((d) => {
      d.y = ringRadius[d.depth] || 0;
    });
  }

  function radialPoint(x, y) {
    const angle = x - Math.PI / 2;
    return [y * Math.cos(angle), y * Math.sin(angle)];
  }

  function update(source, isInitial) {
    layout(root);

    const nodes = root.descendants();
    const links = root.links();

    const duration = 500;
    const stagger = (d) => (isInitial ? d.target.depth * 60 : 0);
    const nodeStagger = (d) => (isInitial ? d.depth * 60 : 0);

    // ---- links ----
    const linkGen = d3
      .linkRadial()
      .angle((d) => d.x)
      .radius((d) => d.y);

    const linkSel = gLinks.selectAll("path.link").data(links, (d) => d.target.id);

    const linkEnter = linkSel
      .enter()
      .append("path")
      .attr("class", "link")
      .attr("d", () => {
        const o = { x: source.x0 ?? source.x, y: source.y0 ?? source.y };
        return linkGen({ source: o, target: o });
      });

    linkEnter
      .merge(linkSel)
      .transition()
      .duration(duration)
      .delay(stagger)
      .attr("d", linkGen);

    linkSel
      .exit()
      .transition()
      .duration(duration)
      .attr("d", () => {
        const o = { x: source.x, y: source.y };
        return linkGen({ source: o, target: o });
      })
      .remove();

    // ---- nodes ----
    const nodeSel = gNodes.selectAll("g.node").data(nodes, (d) => d.id);

    const nodeEnter = nodeSel
      .enter()
      .append("g")
      .attr("class", (d) => `node tag-${d.data.tag}${d.children || d._children ? " has-children" : ""}`)
      .attr("transform", () => {
        const [x, y] = radialPoint(source.x0 ?? source.x, source.y0 ?? source.y);
        return `translate(${x},${y})`;
      })
      .style("opacity", 0)
      .on("click", (event, d) => {
        event.stopPropagation();
        onNodeClick(d);
      })
      .on("mouseenter", (event, d) => {
        showTooltip(event, d);
        applyHoverPreview(d);
      })
      .on("mousemove", (event) => moveTooltip(event))
      .on("mouseleave", (event, d) => {
        hideTooltip();
        clearHoverPreview();
      });

    if (nodeShapeOn === "circle") {
      // Labels are pointer-events:none (see CSS), so the visible dot is the only
      // clickable area on a node — this invisible, larger circle behind it gives
      // mouse and touch a real hit target without changing how the node looks.
      nodeEnter
        .append("circle")
        .attr("class", "hit-target")
        .attr("r", (d) => Math.max(baseRadius(d.data.tag) + 14, 20));

      nodeEnter
        .append("circle")
        .attr("class", "node-dot")
        .attr("r", 1e-6)
        .style("--base-r", (d) => `${baseRadius(d.data.tag)}px`)
        .attr("fill", (d) => colorFor(d.data.tag));
    } else {
      // Rounded-rectangle / pill bubbles carry the label inside them, so they're
      // sized to fit the rendered text (see sizeShapeToLabel) rather than using
      // a fixed tag-based radius. The shape itself is the click/hover target —
      // no separate hit-target needed since it's already a generous area.
      nodeEnter
        .append("rect")
        .attr("class", "node-shape")
        .attr("width", 1e-6)
        .attr("height", 1e-6)
        .attr("fill", (d) => colorFor(d.data.tag));
    }

    nodeEnter.append("text").attr("class", "node-label").attr("dy", "0.31em");

    // Small "open in a new tab" glyph for nodes that represent a real crawled
    // URL (site + page nodes). Positioned per-shape below (above the dot for
    // circles, in the shape's corner for rect/pill).
    nodeEnter
      .filter((d) => !!d.data.url)
      .append("text")
      .attr("class", "node-link-icon")
      .text("↗")
      .on("click", (event, d) => {
        event.stopPropagation();
        window.open(d.data.url, "_blank", "noopener,noreferrer");
      })
      .append("title")
      .text((d) => `Open ${d.data.url} in a new tab`);

    const nodeMerge = nodeEnter.merge(nodeSel);

    nodeMerge
      .attr("class", (d) => {
        const cls = ["node", `tag-${d.data.tag}`, `shape-${nodeShapeOn}`];
        if (d.children || d._children) cls.push("has-children");
        return cls.join(" ");
      })
      .transition()
      .duration(duration)
      .delay(nodeStagger)
      .style("opacity", 1)
      .attr("transform", (d) => {
        const [x, y] = radialPoint(d.x, d.y);
        return `translate(${x},${y})`;
      });

    if (nodeShapeOn === "circle") {
      // Pop the circle in from zero radius — plays for every newly-revealed node,
      // whether that's the first render or a click expanding a branch.
      nodeMerge
        .select("circle.node-dot")
        .transition()
        .duration(duration)
        .delay(nodeStagger)
        .attr("r", (d) => baseRadius(d.data.tag));

      // Nodes are placed via cartesian translate (not a rotated group), so labels
      // stay upright; only the anchor/side flips based on which half they're on.
      renderLabel(nodeMerge.select("text.node-label"));

      nodeMerge
        .select("text.node-link-icon")
        .attr("text-anchor", "middle")
        .attr("y", (d) => -(baseRadius(d.data.tag) + 16));
    } else {
      renderLabelInside(nodeMerge.select("text.node-label"));
      sizeShapeToLabel(nodeMerge, duration, nodeStagger);
    }

    nodeSel
      .exit()
      .transition()
      .duration(duration)
      .style("opacity", 0)
      .attr("transform", () => {
        const [x, y] = radialPoint(source.x, source.y);
        return `translate(${x},${y})`;
      })
      .remove();

    root.each((d) => {
      d.x0 = d.x;
      d.y0 = d.y;
    });

    applyFocusClasses();
  }

  function truncateLabel(d) {
    const tag = d.data.tag;
    const name = displayName(d);
    const insideShape = nodeShapeOn !== "circle";
    const big = tag === "site" || tag === "page";
    const max = insideShape ? (big ? 34 : 28) : big ? 28 : 22;
    if (!name) return friendlyTag(tag);
    return name.length > max ? `${name.slice(0, max - 1)}…` : name;
  }

  // Nodes are placed via cartesian translate (not a rotated group), so labels stay
  // upright; only the anchor/side flips based on which half of the circle they're on.
  function labelX(d) {
    return Math.cos(d.x - Math.PI / 2) >= 0 ? 9 : -9;
  }
  function labelAnchor(d) {
    return Math.cos(d.x - Math.PI / 2) >= 0 ? "start" : "end";
  }

  // Circle mode: label beside the dot, tspans (title, plus an optional smaller
  // URL-path line for page nodes) aligned to whichever side of the dot they're on.
  function renderLabel(sel) {
    sel.each(function (d) {
      const textEl = d3.select(this);
      const x = labelX(d);
      textEl.attr("x", x).attr("text-anchor", labelAnchor(d));
      textEl.selectAll("tspan").remove();
      textEl.append("tspan").attr("x", x).text(truncateLabel(d));
      if (showUrlsOn && d.data.tag === "page" && d.data.url) {
        textEl
          .append("tspan")
          .attr("class", "node-path")
          .attr("x", x)
          .attr("dy", "1.15em")
          .text(pathLabel(d.data.url));
      }
    });
  }

  // Rect/pill mode: label centered inside the shape instead of offset beside
  // it. Sizing happens afterward in sizeShapeToLabel, once this text is
  // actually in the DOM and can be measured.
  function renderLabelInside(sel) {
    sel.each(function (d) {
      const textEl = d3.select(this);
      textEl.attr("x", 0).attr("text-anchor", "middle");
      textEl.selectAll("tspan").remove();
      const hasPath = showUrlsOn && d.data.tag === "page" && d.data.url;
      textEl
        .append("tspan")
        .attr("x", 0)
        .attr("dy", hasPath ? "-0.1em" : "0.31em")
        .text(truncateLabel(d));
      if (hasPath) {
        textEl
          .append("tspan")
          .attr("class", "node-path")
          .attr("x", 0)
          .attr("dy", "1.15em")
          .text(pathLabel(d.data.url));
      }
    });
  }

  // Measures each node's now-rendered label and grows its rect/pill to fit,
  // anchoring the "open in a new tab" icon to the shape's top-right corner.
  function sizeShapeToLabel(sel, duration, nodeStagger) {
    sel.each(function (d) {
      const g = d3.select(this);
      const textNode = g.select("text.node-label").node();
      if (!textNode) return;
      const bbox = textNode.getBBox();
      const padX = 14;
      const padY = 8;
      const big = d.data.tag === "site" || d.data.tag === "page";
      const w = Math.max(bbox.width + padX * 2, big ? 46 : 34);
      const h = Math.max(bbox.height + padY * 2, 26);
      const rx = nodeShapeOn === "pill" ? h / 2 : big ? 12 : 8;
      g.select("rect.node-shape")
        .transition()
        .duration(duration)
        .delay(nodeStagger(d))
        .attr("x", -w / 2)
        .attr("y", -h / 2)
        .attr("width", w)
        .attr("height", h)
        .attr("rx", rx)
        .attr("ry", rx);
      g.select("text.node-link-icon")
        .attr("text-anchor", "end")
        .attr("x", w / 2 - 3)
        .attr("y", -h / 2 + 11);
    });
  }

  // Re-renders every visible node's label in place (no re-layout/animation) —
  // used when the friendly-names or show-URLs toggle flips, since node
  // positions don't change.
  function relabelNodes() {
    const labels = gNodes.selectAll("g.node").select("text.node-label");
    if (nodeShapeOn === "circle") {
      renderLabel(labels);
    } else {
      renderLabelInside(labels);
      sizeShapeToLabel(gNodes.selectAll("g.node"), 0, () => 0);
    }
  }

  // Structural change (different child elements per node), so the cleanest way
  // to switch shapes is to clear the rendered DOM and let update() re-enter
  // every node fresh under the newly-selected shape.
  function rebuildNodeShapes() {
    gNodes.selectAll("*").remove();
    gLinks.selectAll("*").remove();
    update(root, true);
  }

  // ---------- semantic zoom (thin out labels when zoomed out) ----------
  // Fully expanding a real site can put hundreds of labels on screen at once;
  // at a wide-open zoom level they overlap into noise. Structural nodes (site,
  // page, header/nav/main/etc.) stay legible longer since there are few of
  // them; deep/leaf content needs a closer zoom before its label appears.
  // Dots and links stay visible throughout — only text fades. Rect/pill mode
  // skips this: an empty box with no label looks broken, not decluttered.
  function labelZoomThreshold(tag) {
    if (tag === "site" || tag === "page") return 0;
    const baseTag = tag.replace(/-group$/, "");
    if (["header", "nav", "main", "section", "article", "aside", "footer", "form"].includes(baseTag))
      return 0.35;
    if (/^h[1-6]$/.test(baseTag)) return 0.5;
    return 0.75;
  }

  function updateLabelVisibility(k) {
    gNodes
      .selectAll("g.node")
      .select("text.node-label")
      .classed("label-hidden", (d) => nodeShapeOn === "circle" && k < labelZoomThreshold(d.data.tag));
  }

  function onNodeClick(d) {
    if (d.children) {
      d._children = d.children;
      d.children = null;
    } else if (d._children) {
      d.children = d._children;
      d._children = null;
    }
    update(d);
    setFocus(d);
    fitToNode(d, 650);
  }

  // ---------- focus / dimming ----------
  let focusedId = null;

  function setFocus(d) {
    focusedId = d.id;
    applyFocusClasses();
    updateBreadcrumb(d);
  }

  function clearFocus() {
    focusedId = null;
    applyFocusClasses();
    breadcrumbEl.textContent = root ? root.data.name : "";
  }

  function applyFocusClasses() {
    if (!root) return;
    if (!focusedId) {
      gNodes.selectAll("g.node").classed("dimmed", false).classed("on-path", false).classed("focused", false);
      gLinks.selectAll("path.link").classed("dimmed", false).classed("on-path", false);
      return;
    }
    const target = root.descendants().find((n) => n.id === focusedId);
    if (!target) return;
    const keep = new Set();
    keep.add(target.id);
    target.ancestors().forEach((n) => keep.add(n.id));
    target.descendants().forEach((n) => keep.add(n.id));

    gNodes
      .selectAll("g.node")
      .classed("dimmed", (d) => !keep.has(d.id))
      .classed("on-path", (d) => keep.has(d.id))
      .classed("focused", (d) => d.id === target.id);

    gLinks
      .selectAll("path.link")
      .classed("dimmed", (d) => !keep.has(d.source.id) || !keep.has(d.target.id))
      .classed("on-path", (d) => keep.has(d.source.id) && keep.has(d.target.id));
  }

  function updateBreadcrumb(d) {
    const chain = d.ancestors().reverse().map((n) => n.data.name || friendlyTag(n.data.tag));
    breadcrumbEl.innerHTML = chain.map((c, i) => `<span>${escapeHtml(c)}</span>`).join(" › ");
  }

  // ---------- fit / zoom ----------
  function fitToNode(d, duration = 700) {
    const nodesInScope = d.children ? [d, ...d.descendants()] : [d];
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    nodesInScope.forEach((n) => {
      const [x, y] = radialPoint(n.x, n.y);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });
    const pad = 80;
    const bboxW = Math.max(maxX - minX, 40) + pad * 2;
    const bboxH = Math.max(maxY - minY, 40) + pad * 2;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const scale = Math.min(width / bboxW, height / bboxH, 2.2);
    const clampedScale = Math.max(scale, 0.12);

    const transform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(clampedScale)
      .translate(-cx, -cy);

    if (duration > 0) {
      svg.transition().duration(duration).call(zoomBehavior.transform, transform);
    } else {
      svg.call(zoomBehavior.transform, transform);
    }
  }

  resetViewBtn.addEventListener("click", () => {
    clearFocus();
    fitToNode(root, 600);
  });

  expandAllBtn.addEventListener("click", () => {
    expandAllNode(root);
    update(root);
    fitToNode(root, 600);
  });

  expandNextBtn.addEventListener("click", () => {
    expandNextLayer(root);
    update(root);
    fitToNode(root, 600);
  });

  collapseAllBtn.addEventListener("click", () => {
    collapseToPages(root, 0);
    clearFocus();
    update(root);
    fitToNode(root, 600);
  });

  // ---------- tooltip ----------
  function showTooltip(event, d) {
    const tag = friendlyTag(d.data.tag);
    const url = d.data.url ? `<div class="t-url">${escapeHtml(d.data.url)}</div>` : "";
    tooltipEl.innerHTML = `<div class="t-tag">${escapeHtml(tag)}</div><div>${escapeHtml(
      d.data.name || ""
    )}</div>${url}`;
    tooltipEl.classList.add("visible");
    moveTooltip(event);
  }
  function moveTooltip(event) {
    const wrap = document.getElementById("canvas-wrap").getBoundingClientRect();
    tooltipEl.style.left = `${event.clientX - wrap.left}px`;
    tooltipEl.style.top = `${event.clientY - wrap.top}px`;
  }
  function hideTooltip() {
    tooltipEl.classList.remove("visible");
  }

  // ---------- hover preview (lightweight focus preview without committing zoom) ----------
  function applyHoverPreview(d) {
    if (focusedId) return; // an active click-focus always wins
    const keep = new Set();
    keep.add(d.id);
    d.ancestors().forEach((n) => keep.add(n.id));
    d.descendants().forEach((n) => keep.add(n.id));

    gNodes
      .selectAll("g.node")
      .classed("hover-dim", (n) => !keep.has(n.id))
      .classed("hover-path", (n) => keep.has(n.id) && n.id !== d.id);

    gLinks
      .selectAll("path.link")
      .classed("hover-path", (l) => keep.has(l.source.id) && keep.has(l.target.id))
      .classed("hover-dim", (l) => !(keep.has(l.source.id) && keep.has(l.target.id)));
  }

  function clearHoverPreview() {
    if (focusedId) return;
    gNodes.selectAll("g.node").classed("hover-dim", false).classed("hover-path", false);
    gLinks.selectAll("path.link").classed("hover-dim", false).classed("hover-path", false);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  // ---------- search ----------
  let matches = [];
  let matchIndex = -1;

  function runSearch(query) {
    gNodes.selectAll("g.node").classed("match", false).classed("match-current", false);
    matches = [];
    matchIndex = -1;
    if (!root || !query.trim()) return;
    const q = query.trim().toLowerCase();

    // Expand ancestors of any matching node anywhere in the full tree (including collapsed).
    const full = root; // root always holds full data via _children chains
    const found = [];
    full.each((d) => {
      const combined = `${d.data.name || ""} ${d.data.tag || ""}`.toLowerCase();
      if (combined.includes(q)) found.push(d);
    });
    // Also search inside currently-collapsed subtrees.
    (function walkCollapsed(node) {
      const kids = node._children;
      if (kids) {
        kids.forEach((k) => {
          const combined = `${k.data.name || ""} ${k.data.tag || ""}`.toLowerCase();
          if (combined.includes(q) && !found.includes(k)) found.push(k);
          walkCollapsed(k);
        });
      }
      if (node.children) node.children.forEach(walkCollapsed);
    })(full);

    if (!found.length) return;

    found.forEach((n) => {
      n.ancestors().forEach((a) => {
        if (a._children) {
          a.children = a._children;
          a._children = null;
        }
      });
    });
    update(root);

    matches = found
      .map((n) => root.descendants().find((d) => d.id === n.id))
      .filter(Boolean);
    matchIndex = 0;
    gNodes.selectAll("g.node").classed("match", (d) => matches.some((m) => m.id === d.id));
    jumpToMatch();
  }

  function jumpToMatch() {
    if (!matches.length) return;
    gNodes.selectAll("g.node").classed("match-current", false);
    const d = matches[matchIndex];
    gNodes.selectAll("g.node").filter((n) => n.id === d.id).classed("match-current", true);
    setFocus(d);
    fitToNode(d, 600);
  }

  searchInput.addEventListener("input", (e) => runSearch(e.target.value));
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && matches.length) {
      matchIndex = (matchIndex + 1) % matches.length;
      jumpToMatch();
    }
  });

  // ---------- report ----------
  // A printable, self-contained HTML report: one section per page, each with
  // a static PNG snapshot of that page's portion of the map (rendered fresh
  // into an offscreen SVG, always as light-background rect bubbles regardless
  // of the live theme/shape/style, so it stays legible on paper) plus a
  // breakdown of how many of each element-type category it contains.

  function categoryLabelForTag(tag) {
    const baseTag = tag.replace(/-group$/, "");
    const cat = activeCategories.find((c) => c.value.split(",").includes(baseTag));
    return cat ? cat.label : null;
  }

  function collectStructuralCounts(pageNode) {
    const counts = new Map();
    (function walk(n) {
      if (n.tag !== "page") {
        const label = categoryLabelForTag(n.tag);
        if (label) counts.set(label, (counts.get(label) || 0) + (n.count || 1));
      }
      (n.children || []).forEach(walk);
    })(pageNode);
    return counts;
  }

  const SNAPSHOT_MAX_DEPTH = 3;
  const SNAPSHOT_MAX_CHILDREN = 10;

  function capForSnapshot(node, depth) {
    const clone = { id: node.id, tag: node.tag, name: node.name, url: node.url };
    if (depth >= SNAPSHOT_MAX_DEPTH || !node.children || !node.children.length) return clone;
    clone.children = node.children.slice(0, SNAPSHOT_MAX_CHILDREN).map((c) => capForSnapshot(c, depth + 1));
    return clone;
  }

  function snapshotLabel(d) {
    const name = displayName(d) || friendlyTag(d.data.tag);
    const max = d.data.tag === "page" ? 30 : 24;
    return name && name.length > max ? `${name.slice(0, max - 1)}…` : name;
  }

  function snapshotFootprint(d) {
    const big = d.data.tag === "page";
    const w = Math.max(measureTextWidthPx(snapshotLabel(d)) + 26, big ? 46 : 32);
    return { halfWidth: w / 2, height: 26 };
  }

  // A standalone copy of the live collision-free ring layout (see `layout`
  // above), sized off snapshotFootprint instead of the live nodeFootprint so
  // report snapshots don't depend on — or get disturbed by — the on-screen
  // shape/toggle state.
  function snapshotLayout(hRoot) {
    const step = RADIUS_STEP_MIN * 0.65;
    const tree = d3
      .tree()
      .size([2 * Math.PI, 1])
      .separation((a, b) => {
        const gap =
          snapshotFootprint(a).halfWidth +
          snapshotFootprint(b).halfWidth +
          (a.parent === b.parent ? NODE_MARGIN : NODE_MARGIN * 2);
        return gap / 40;
      });
    tree(hRoot);

    const byDepth = new Map();
    let maxDepth = 0;
    hRoot.each((d) => {
      if (!byDepth.has(d.depth)) byDepth.set(d.depth, []);
      byDepth.get(d.depth).push(d);
      if (d.depth > maxDepth) maxDepth = d.depth;
    });

    const ringRadius = new Array(maxDepth + 1).fill(0);
    for (let depth = 1; depth <= maxDepth; depth++) {
      const ring = (byDepth.get(depth) || []).slice().sort((a, b) => a.x - b.x);
      let needed = step;
      if (ring.length >= 2) {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i];
          const b = ring[(i + 1) % ring.length];
          const gapAngle = i === ring.length - 1 ? 2 * Math.PI - a.x + b.x : b.x - a.x;
          const req =
            (snapshotFootprint(a).halfWidth + snapshotFootprint(b).halfWidth + NODE_MARGIN) / Math.max(gapAngle, 0.0005);
          if (req > needed) needed = req;
        }
      }
      ringRadius[depth] = Math.max(ringRadius[depth - 1] + step, needed);
    }
    hRoot.each((d) => {
      d.y = ringRadius[d.depth] || 0;
    });
  }

  function renderSnapshotSvg(pageNode) {
    const capped = capForSnapshot(pageNode, 0);
    const h = d3.hierarchy(capped, (d) => d.children);
    let seq = 0;
    h.each((d) => {
      d.id = `snap${seq++}`;
    });
    snapshotLayout(h);

    const nodes = h.descendants();
    const links = h.links();

    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    nodes.forEach((d) => {
      const [px, py] = radialPoint(d.x, d.y);
      const fp = snapshotFootprint(d);
      minX = Math.min(minX, px - fp.halfWidth);
      maxX = Math.max(maxX, px + fp.halfWidth);
      minY = Math.min(minY, py - fp.height / 2);
      maxY = Math.max(maxY, py + fp.height / 2);
    });
    const pad = 20;
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;
    const width = Math.max(maxX - minX, 100);
    const height = Math.max(maxY - minY, 100);

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("xmlns", svgNS);
    svg.setAttribute("viewBox", `${minX} ${minY} ${width} ${height}`);
    svg.setAttribute("width", String(Math.round(width)));
    svg.setAttribute("height", String(Math.round(height)));

    const bg = document.createElementNS(svgNS, "rect");
    bg.setAttribute("x", String(minX));
    bg.setAttribute("y", String(minY));
    bg.setAttribute("width", String(width));
    bg.setAttribute("height", String(height));
    bg.setAttribute("fill", "#ffffff");
    svg.appendChild(bg);

    const linkGen = d3
      .linkRadial()
      .angle((d) => d.x)
      .radius((d) => d.y);
    links.forEach((l) => {
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", linkGen(l));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "#a6afbd");
      path.setAttribute("stroke-width", "1.4");
      svg.appendChild(path);
    });

    nodes.forEach((d) => {
      const [px, py] = radialPoint(d.x, d.y);
      const g = document.createElementNS(svgNS, "g");
      g.setAttribute("transform", `translate(${px},${py})`);

      const fp = snapshotFootprint(d);
      const rect = document.createElementNS(svgNS, "rect");
      rect.setAttribute("x", String(-fp.halfWidth));
      rect.setAttribute("y", String(-fp.height / 2));
      rect.setAttribute("width", String(fp.halfWidth * 2));
      rect.setAttribute("height", String(fp.height));
      rect.setAttribute("rx", "8");
      rect.setAttribute("fill", colorFor(d.data.tag));
      rect.setAttribute("stroke", "#1f2430");
      rect.setAttribute("stroke-width", "1.2");
      g.appendChild(rect);

      const text = document.createElementNS(svgNS, "text");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dy", "0.32em");
      text.setAttribute("font-family", "Arial, Helvetica, sans-serif");
      text.setAttribute("font-size", "11");
      text.setAttribute("fill", "#12151c");
      text.textContent = snapshotLabel(d);
      g.appendChild(text);

      svg.appendChild(g);
    });

    return { svgString: new XMLSerializer().serializeToString(svg), width, height };
  }

  function svgStringToPngDataUrl(svgString, width, height, scale = 2) {
    return new Promise((resolve, reject) => {
      const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    });
  }

  function buildReportHtml(siteTree, sections) {
    const meta = siteTree.meta || {};
    const errCount = (meta.errors || []).length;
    const modeLabel = meta.mode === "layout" ? "Page layout" : "Site map";
    const generated = new Date().toLocaleString();

    const toc = sections.map((s, i) => `<li><a href="#page-${i}">${escapeHtml(s.page.name)}</a></li>`).join("");

    const body = sections
      .map((s, i) => {
        const rows = [...s.counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([label, count]) => `<tr><td>${escapeHtml(label)}</td><td class="n">${count}</td></tr>`)
          .join("");
        const img = s.pngUrl
          ? `<img src="${s.pngUrl}" alt="Mindmap snapshot for ${escapeHtml(s.page.name)}" />`
          : `<div class="no-snapshot">Snapshot unavailable</div>`;
        return `
      <section class="page-section" id="page-${i}">
        <h2>${escapeHtml(s.page.name)}</h2>
        <div class="url"><a href="${escapeHtml(s.page.url)}">${escapeHtml(s.page.url)}</a></div>
        ${img}
        ${
          rows
            ? `<table class="counts"><tbody>${rows}</tbody></table>`
            : `<p class="empty">Nothing found here that matches the current element-type filter.</p>`
        }
      </section>`;
      })
      .join("");

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(siteTree.name)} — Website Layout Report</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Inter, Arial, sans-serif; color: #1a1f29; margin: 0 auto; padding: 36px 40px 60px; max-width: 880px; background: #fff; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .meta { color: #5a6472; font-size: 13px; margin-bottom: 22px; }
  .stat-row { display: flex; gap: 14px; margin-bottom: 28px; flex-wrap: wrap; }
  .stat { background: #f3f5f9; border-radius: 8px; padding: 10px 16px; font-size: 12px; color: #5a6472; min-width: 110px; }
  .stat b { display: block; font-size: 20px; color: #1a1f29; }
  .toc { margin-bottom: 32px; font-size: 13px; }
  .toc h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: #5a6472; margin-bottom: 8px; }
  .toc ol { margin: 0; padding-left: 20px; }
  .toc a, section.page-section .url a { color: #2f6fd6; text-decoration: none; }
  .toc a:hover, section.page-section .url a:hover { text-decoration: underline; }
  section.page-section { break-inside: avoid; page-break-inside: avoid; margin-bottom: 44px; padding-top: 20px; border-top: 1px solid #e2e6ed; }
  section.page-section h2 { font-size: 16px; margin: 0 0 2px; }
  section.page-section .url { font-size: 12px; color: #5a6472; margin-bottom: 14px; word-break: break-all; }
  section.page-section img { max-width: 100%; border: 1px solid #e2e6ed; border-radius: 8px; display: block; margin-bottom: 14px; background: #fff; }
  .no-snapshot, .empty { font-size: 12px; color: #8a93a3; font-style: italic; }
  table.counts { border-collapse: collapse; font-size: 12px; }
  table.counts td { padding: 4px 14px 4px 0; border-bottom: 1px solid #eef0f4; }
  table.counts td.n { text-align: right; padding-right: 0; font-variant-numeric: tabular-nums; color: #2f6fd6; font-weight: 600; min-width: 32px; }
  footer { margin-top: 40px; font-size: 11px; color: #8a93a3; }
  @media print {
    body { padding: 0; max-width: none; }
    section.page-section { break-before: page; padding-top: 0; border-top: none; }
    section.page-section:first-of-type { break-before: avoid; }
  }
</style>
</head>
<body>
  <h1>${escapeHtml(siteTree.name)}</h1>
  <div class="meta">Website Layout Report · ${escapeHtml(modeLabel)} mode · Generated ${escapeHtml(generated)}</div>
  <div class="stat-row">
    <div class="stat"><b>${meta.pagesCrawled ?? sections.length}</b>Pages crawled</div>
    <div class="stat"><b>${errCount}</b>Crawl error(s)</div>
    <div class="stat"><b>${sections.length}</b>Pages in report</div>
  </div>
  <div class="toc">
    <h2>Pages</h2>
    <ol>${toc}</ol>
  </div>
  ${body}
  <footer>Generated by Website Mind Map. Use your browser's Print (Ctrl/Cmd+P) to save this as a PDF.</footer>
</body>
</html>`;
  }

  async function generateReport() {
    if (!lastTreeData) return;
    // Opened synchronously (before any await) so it isn't blocked as a popup.
    const reportWindow = window.open("", "_blank");
    if (!reportWindow) {
      alert("Your browser blocked the report tab from opening. Please allow pop-ups for this site and try again.");
      return;
    }
    reportWindow.document.title = "Generating report…";
    reportWindow.document.body.innerHTML =
      '<div style="font-family:sans-serif;padding:60px;color:#444">Generating report — this can take a few seconds for larger sites…</div>';

    reportBtn.disabled = true;
    const originalLabel = reportBtn.textContent;
    reportBtn.textContent = "Generating…";

    try {
      const filtered = applyTypeFilter(lastTreeData);
      const pages = filtered.children || [];
      const sections = [];
      for (const page of pages) {
        let pngUrl = null;
        try {
          const { svgString, width, height } = renderSnapshotSvg(page);
          pngUrl = await svgStringToPngDataUrl(svgString, width, height, 2);
        } catch {
          pngUrl = null;
        }
        sections.push({ page, pngUrl, counts: collectStructuralCounts(page) });
      }
      const html = buildReportHtml(filtered, sections);
      reportWindow.document.open();
      reportWindow.document.write(html);
      reportWindow.document.close();
    } catch (err) {
      reportWindow.document.body.innerHTML = `<div style="font-family:sans-serif;padding:60px;color:#a4322a">Report generation failed: ${escapeHtml(
        err.message || String(err)
      )}</div>`;
    } finally {
      reportBtn.disabled = false;
      reportBtn.textContent = originalLabel;
    }
  }

  reportBtn.addEventListener("click", () => {
    generateReport();
  });

  showPanel("empty");
})();
