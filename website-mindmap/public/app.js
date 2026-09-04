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
    };
    return map[tag] || tag;
  }

  // ---------- DOM refs ----------
  const $ = (sel) => document.querySelector(sel);
  const form = $("#analyze-form");
  const urlInput = $("#url-input");
  const advancedToggle = $("#advanced-toggle");
  const advancedPanel = $("#advanced-panel");
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
  const collapseAllBtn = $("#collapse-all-btn");
  const legendToggleBtn = $("#legend-toggle-btn");
  const legendEl = $("#legend");
  const tooltipEl = $("#tooltip");
  const breadcrumbEl = $("#breadcrumb");
  const statsEl = $("#stats");
  const themeSelect = $("#theme-select");

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

  advancedToggle.addEventListener("click", () => {
    const isHidden = advancedPanel.classList.contains("hidden");
    advancedPanel.classList.toggle("hidden");
    advancedToggle.setAttribute("aria-expanded", String(isHidden));
  });

  legendToggleBtn.addEventListener("click", () => legendEl.classList.toggle("hidden"));

  function buildLegend() {
    const entries = [
      ["site", "Website root"],
      ["page", "Page"],
      ["header", "Header / Nav / Footer"],
      ["main", "Main / Section / Article"],
      ["h1", "Heading"],
      ["ul", "List / Table / Group"],
      ["default", "Other element"],
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
  buildLegend();

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
    });
    const es = new EventSource(`/api/analyze?${params.toString()}`);
    activeSource = es;

    es.addEventListener("progress", (ev) => {
      const data = JSON.parse(ev.data);
      if (data.type === "fetching") {
        progressHeadline.textContent = `Fetching page ${data.index}/${data.total}…`;
        logProgress(`→ ${data.url}`);
      } else if (data.type === "parsed") {
        logProgress(`✓ parsed ${data.url} (${data.nodeCount} layout nodes)`);
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
      renderMindMap(tree);
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

    zoomLayer = svg.append("g").attr("class", "zoom-layer");
    gLinks = zoomLayer.append("g").attr("class", "links-layer");
    gNodes = zoomLayer.append("g").attr("class", "nodes-layer");

    zoomBehavior = d3
      .zoom()
      .scaleExtent([0.08, 4])
      .on("zoom", (event) => {
        zoomLayer.attr("transform", event.transform);
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

  const RADIUS_STEP = 130;

  function layout(rootNode) {
    const tree = d3
      .tree()
      .size([2 * Math.PI, 1])
      .separation((a, b) => (a.parent === b.parent ? 1.4 : 2.6) / Math.max(a.depth, 1));
    tree(rootNode);
    rootNode.each((d) => {
      d.y = d.depth * RADIUS_STEP;
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

    nodeEnter
      .append("circle")
      .attr("r", 1e-6)
      .style("--base-r", (d) => `${baseRadius(d.data.tag)}px`)
      .attr("fill", (d) => colorFor(d.data.tag));

    nodeEnter
      .append("text")
      .attr("dy", "0.31em")
      .text((d) => truncateLabel(d.data.name, d.data.tag));

    const nodeMerge = nodeEnter.merge(nodeSel);

    nodeMerge
      .attr("class", (d) => {
        const cls = ["node", `tag-${d.data.tag}`];
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

    // Pop the circle in from zero radius — plays for every newly-revealed node,
    // whether that's the first render or a click expanding a branch.
    nodeMerge
      .select("circle")
      .transition()
      .duration(duration)
      .delay(nodeStagger)
      .attr("r", (d) => baseRadius(d.data.tag));

    // Nodes are placed via cartesian translate (not a rotated group), so labels stay
    // upright; only the anchor/side flips based on which half of the circle they're on.
    nodeMerge
      .select("text")
      .attr("x", (d) => (Math.cos(d.x - Math.PI / 2) >= 0 ? 9 : -9))
      .attr("text-anchor", (d) => (Math.cos(d.x - Math.PI / 2) >= 0 ? "start" : "end"));

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

  function truncateLabel(name, tag) {
    const max = tag === "site" || tag === "page" ? 28 : 22;
    if (!name) return friendlyTag(tag);
    return name.length > max ? `${name.slice(0, max - 1)}…` : name;
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

  showPanel("empty");
})();
