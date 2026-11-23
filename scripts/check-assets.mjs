// Fails when an image in src/assets is larger than the budget, so oversized
// originals are not committed by accident. Run with: npm run check:assets
import { readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = new URL('../src/assets/', import.meta.url).pathname;
const MAX_KB = Number(process.env.MAX_ASSET_KB ?? 1200);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']);

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const tooBig = walk(ROOT)
  .filter((p) => IMAGE_EXT.has(extname(p).toLowerCase()))
  .map((p) => ({ p, kb: Math.round(statSync(p).size / 1024) }))
  .filter((f) => f.kb > MAX_KB);

if (tooBig.length) {
  console.error(`Images over the ${MAX_KB} KB budget:`);
  for (const f of tooBig) console.error(`  ${f.p.replace(ROOT, 'src/assets/')}: ${f.kb} KB`);
  process.exit(1);
}
console.log(`All images are within the ${MAX_KB} KB budget.`);
