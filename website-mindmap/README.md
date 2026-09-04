# Website Mind Map

Crawls a website and turns its full page and layout structure into a live,
interactive mind map — pages branch out from the site root, and each page
expands into its own header/nav/sections/headings/etc., all navigable with
smooth zoom, click-to-focus, and search.

## What it does

1. **Crawl** — starting from a URL, it follows same-origin links (breadth-first,
   configurable depth and page limit) while respecting `robots.txt`.
2. **Summarize layout** — for each page it walks the DOM and builds a pruned
   tree of the meaningful structure: `header` / `nav` / `main` / `section` /
   `article` / `aside` / `footer` / `form`, headings, images, buttons, lists,
   tables, etc. Repetitive siblings (e.g. 20 `<li>`s) are grouped into a single
   "N × li" node with a few samples, so the map stays readable instead of
   exploding into thousands of leaves.
3. **Visualize** — the browser renders the result as a radial, collapsible
   D3 tree: site → pages → layout sections → nested content. Click a node to
   expand it and the view smoothly zooms/pans to fit, dimming everything
   outside that branch so you can focus on one part of the site at a time.

## Run it

```bash
cd website-mindmap
npm install     # also vendors a local copy of D3 into public/vendor
npm start        # http://localhost:4173
```

Open the URL, paste a website address, and click **Analyze**. Progress
(pages fetched, parsed, skipped, or failed) streams in live while the crawl
runs; the mind map appears as soon as it finishes.

### Options

- **Max pages** (default 15, capped at 30) — how many pages to crawl in total.
- **Crawl depth** (default 2, capped at 3) — how many link-hops from the start
  page to follow. `0` maps only the start page.

## Using the map

- **Click a node** to expand/collapse its children — the view zooms and pans
  to fit the newly revealed branch, and everything outside it dims.
- **Click empty canvas** to clear focus; **Fit** re-centers on the whole map.
- **Expand all / Collapse** — open every node at once, or collapse back down
  to just the site's pages.
- **Search** — type to highlight matching nodes anywhere in the site
  (including still-collapsed branches, which auto-expand); press **Enter**
  to jump between matches.
- **Scroll/drag** to pan and zoom freely at any time.
- **Hover** a node for its full tag and text/URL in a tooltip.

## Notes & limits

- This only sees what a plain HTTP fetch returns — it does not run
  JavaScript, so client-side-rendered content that isn't in the initial
  HTML won't appear. (A headless-browser crawl mode would be the natural
  next step if that's needed.)
- It identifies itself with a descriptive User-Agent and honors
  `Disallow` rules in `robots.txt` for `User-agent: *`.
- Crawling is intentionally conservative (small concurrency, short delay
  between requests, per-request timeout) to be a polite, single-visitor
  crawl — not a load-testing tool.

## Architecture

- `server.js` — Express app; serves `public/` and exposes
  `GET /api/analyze` as a Server-Sent Events stream (progress events, then
  a final `result` or `error` event).
- `src/crawler.js` — the crawl + DOM-to-layout-tree summarization logic
  (no framework dependencies beyond `cheerio`).
- `public/app.js` — the D3-based radial mind map: layout, zoom/pan,
  collapse/expand, focus-and-fit animation, search.
- `public/index.html`, `public/styles.css` — UI shell and dark theme.
