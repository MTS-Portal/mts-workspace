#!/usr/bin/env node
/** SECURITY: remove any emitted `.env*` files from build output / Vercel output. */
import { readdirSync, rmSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const roots = [
  "dist", ".output", ".vercel/output",
  ...(process.env.BROWSER_SMOKE_OUT_DIR ? [process.env.BROWSER_SMOKE_OUT_DIR] : []),
];
let removed = 0;
function walk(dir) {
  if (!existsSync(dir)) return;
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    const full = join(dir, name);
    let st; try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) { walk(full); continue; }
    if (name.startsWith(".env") || name.includes(".env-")) { try { rmSync(full, { force: true }); removed++; } catch { /* ignore */ } }
  }
}
for (const root of roots) walk(root);
console.log(`[strip-env-assets] removed ${removed} env artifact(s)`);
