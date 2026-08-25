/* Build the category tile thumbnails that ship with the site.
 *
 *   node scripts/build-thumbs.mjs [category ...]
 *
 * Picks one image per category from Wikimedia Commons, crops it to
 * 300x170 and writes thumbs/<category>.jpg, plus thumbs/CREDITS.md with a
 * link back to each source file. Run it again to refresh a tile:
 *
 *   node scripts/build-thumbs.mjs textures birds
 *
 * Existing files are kept unless named explicitly, so a tile you like
 * stays put. Resizing uses macOS `sips`, so there is nothing to install.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "thumbs");
const W = 300;
const H = 170;

/* Read the recipe table the app itself uses, so tiles always come from
   the same queries the category actually serves. */
const sandbox = {};
new Function(
  "window",
  readFileSync(join(ROOT, "categories.js"), "utf8") +
    ";this.GROUPS=CATEGORY_GROUPS;this.RECIPES=RECIPES;"
).call(sandbox, {});
const { GROUPS, RECIPES } = sandbox;

/* "objects" is the one category with no Commons recipe of its own. */
const EXTRA_QUERIES = { objects: 'incategory:"Ceramics"' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { "User-Agent": "mnemocine-thumbs/1.0 (one-off tile build)" };

/* Commons refuses bursts, so keep a floor between calls and back off hard
   on a 429 — the whole run is one-time, so patience costs nothing. */
let lastCall = 0;
/* Image downloads go through the same gate as API calls — they hit the
   same infrastructure, and leaving them unthrottled was enough on its own
   to trigger 429s. */
async function throttled(url, tries = 4) {
  for (let attempt = 0; attempt < tries; attempt++) {
    const wait = 4000 - (Date.now() - lastCall);
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    const res = await fetch(url, { headers: UA });
    if (res.status === 429) {
      await sleep(12000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  }
  throw new Error("rate limited");
}

const apiJSON = (url) => throttled(url).then((r) => r.json());

async function commonsPick(query) {
  const url =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json" +
    `&generator=search&gsrsearch=${encodeURIComponent(query + " filetype:bitmap")}` +
    "&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url%7Cmime%7Csize&iiurlwidth=800";
  const data = await apiJSON(url);
  return Object.values(data?.query?.pages ?? {})
    .map((p) => {
      const ii = p.imageinfo?.[0];
      if (!ii?.thumburl || !/^image\/(jpeg|png)/.test(ii.mime || "")) return null;
      if ((ii.width || 0) < 400) return null; // too small to crop cleanly
      return {
        thumb: ii.thumburl,
        page: ii.descriptionurl,
        title: p.title.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, ""),
      };
    })
    .filter(Boolean);
}

function crop(tmp, dest) {
  const dims = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", tmp], {
    encoding: "utf8",
  });
  const w = +(dims.match(/pixelWidth:\s*(\d+)/) || [])[1];
  const h = +(dims.match(/pixelHeight:\s*(\d+)/) || [])[1];
  if (!w || !h) throw new Error("could not read dimensions");
  /* scale so both sides cover the target, then centre-crop. sips needs a
     distinct --out path; reusing the input silently fails. */
  const scaled = tmp.replace(/\.jpg$/, ".scaled.jpg");
  const byHeight = w / h > W / H;
  try {
    execFileSync("sips", [
      byHeight ? "--resampleHeight" : "--resampleWidth",
      String(byHeight ? H : W),
      tmp, "--out", scaled,
    ], { stdio: "ignore" });
    execFileSync("sips", [
      "--cropToHeightWidth", String(H), String(W), scaled, "--out", scaled,
    ], { stdio: "ignore" });
    /* Quality has to be its own invocation — combined with a crop, sips
       silently ignores it and writes at default quality (one 300x170 tile
       came out at 408KB). */
    execFileSync("sips", [
      "-s", "format", "jpeg", "-s", "formatOptions", "65",
      scaled, "--out", dest,
    ], { stdio: "ignore" });
  } finally {
    if (existsSync(scaled)) rmSync(scaled);
  }
}

async function build(catId) {
  const recipe = RECIPES[catId];
  const queries = [...(recipe?.wm ?? []), EXTRA_QUERIES[catId]].filter(Boolean);
  if (!queries.length) return { catId, error: "no Commons query" };
  let lastError = null;

  for (const query of queries) {
    let picks = [];
    try {
      picks = await commonsPick(query);
    } catch (err) {
      lastError = err.message;
      continue;
    }
    for (const pick of picks.slice(0, 4)) {
      const tmp = join(OUT, `.${catId}.tmp.jpg`); // sips infers format from the extension
      try {
        const res = await throttled(pick.thumb);
        writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
        const dest = join(OUT, `${catId}.jpg`);
        crop(tmp, dest);
        /* A tile this size means the source carried something pathological
           (one anatomy plate produced 400KB at 300x170, larger than its own
           uncompressed pixels). Not worth diagnosing — take another image. */
        if (statSync(dest).size > 80 * 1024) {
          rmSync(dest);
          lastError = "oversized output";
          continue;
        }
        return { catId, ...pick };
      } catch (err) {
        lastError = err.message;
      } finally {
        if (existsSync(tmp)) rmSync(tmp);
      }
    }
  }
  return { catId, error: lastError || "no usable image" };
}

const wanted = process.argv.slice(2);
const all = GROUPS.flatMap((g) => g.cats.map((c) => ({ id: c.id, label: c.label, group: g.label })));
const todo = all.filter(
  (c) => wanted.includes(c.id) || (!wanted.length && !existsSync(join(OUT, `${c.id}.jpg`)))
);

mkdirSync(OUT, { recursive: true });
console.log(`${todo.length} thumbnail(s) to build`);

const credits = [];
for (const cat of todo) {
  const result = await build(cat.id);
  if (result.error) console.log(`  ✗ ${cat.id}: ${result.error}`);
  else {
    console.log(`  ✓ ${cat.id}  ${result.title.slice(0, 46)}`);
    credits.push({ ...cat, ...result });
  }
  await sleep(1200); // stay well under Commons' rate limit
}

/* Merge new credits into whatever is already recorded. */
const creditsPath = join(OUT, "CREDITS.md");
const existing = new Map();
if (existsSync(creditsPath)) {
  for (const line of readFileSync(creditsPath, "utf8").split("\n")) {
    const m = line.match(/^\| `([^`]+)` \| (.*) \| (.*) \|$/);
    if (m) existing.set(m[1], { title: m[2], link: m[3] });
  }
}
for (const c of credits) {
  existing.set(c.id, { title: c.title, link: `[source](${c.page})` });
}
writeFileSync(
  creditsPath,
  "# Tile thumbnail sources\n\nOne image per category, cropped to " +
    `${W}x${H} by \`scripts/build-thumbs.mjs\`. All are from Wikimedia\n` +
    "Commons; follow a link for that file's own licence and author.\n\n" +
    "| Category | File | Source |\n|---|---|---|\n" +
    [...existing.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, v]) => `| \`${id}\` | ${v.title} | ${v.link} |`)
      .join("\n") +
    "\n"
);
console.log(`\nwrote ${credits.length} file(s) to thumbs/ and updated CREDITS.md`);
