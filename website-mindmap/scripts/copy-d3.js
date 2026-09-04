import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, "..", "node_modules", "d3", "dist", "d3.min.js");
const destDir = path.join(__dirname, "..", "public", "vendor");
const dest = path.join(destDir, "d3.v7.min.js");

if (!existsSync(src)) {
  console.warn("[copy-d3] d3 dist file not found, skipping copy:", src);
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log("[copy-d3] copied", src, "->", dest);
