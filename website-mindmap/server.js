import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeSite } from "./src/crawler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/analyze", async (req, res) => {
  const { url, maxPages, maxDepth, mode } = req.query;

  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "Missing url query parameter" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const keepAlive = setInterval(() => res.write(": ping\n\n"), 15000);
  req.on("close", () => clearInterval(keepAlive));

  try {
    const tree = await analyzeSite(
      url,
      {
        maxPages: Number(maxPages) || 12,
        maxDepth: maxDepth !== undefined ? Number(maxDepth) : 2,
        mode: mode === "layout" ? "layout" : "sitemap",
      },
      (progress) => send("progress", progress)
    );
    send("result", tree);
  } catch (err) {
    send("error", { message: err.message || "Unknown error" });
  } finally {
    clearInterval(keepAlive);
    res.end();
  }
});

const PORT = process.env.PORT || 4173;
app.listen(PORT, () => {
  console.log(`Website Mind Map running at http://localhost:${PORT}`);
});
