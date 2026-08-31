# Mnemocine

**Bisociation** is the act of perceiving an idea or situation in two
self-consistent but habitually incompatible frames of reference. The term
was coined by Arthur Koestler in *The Act of Creation* (1964), which
argues that a single mental mechanism underlies humour, scientific
discovery, and art: the collision of two unrelated matrices of thought.

The **Mnemosyne Atlas** (*Bilderatlas Mnemosyne*) was Aby Warburg's
unfinished picture atlas (1924–1929): some 63 panels of black cloth
holding nearly a thousand photographs, reproductions, press clippings,
and stamps, pinned and endlessly rearranged so that meaning emerged from
the intervals between images rather than from any image alone.
Mnemosyne — Greek memory, mother of the Muses — named his atlas, and
with *cine* (cinema in Spanish) it names this tool: memory dealt as
frames.

Mnemocine deals three images from the open archives side by side — a
practice exercise in *forced connections* (Einstein called it combinatory
play): take references that don't belong together and find what binds
them. A palette, a gesture, a story, an art direction. For design, art,
and photography practice.

The ethos is accessibility: no account, no subscription, no tracking, no
onboarding, no build step. Open it and practice — and the open archives
deserve the visits. Inspired by
[@russellrjones94](https://www.instagram.com/russellrjones94/)'s Random
Image Selector, which shuffles images from a folder on your own machine;
Mnemocine is the web-based cousin — if you don't have the storage to
hoard thousands of reference images, you might as well draw from the
archives.

Refresh the page (or press <kbd>space</kbd>) for a new set; each slot has
its own category dropdown, a source-archive dropdown, and a ↻ to reroll
just that slot. Pinning a source grays out the categories that archive
can't answer precisely.

Images zoom in place: scroll to zoom toward the cursor, drag to pan,
double-click to reset. A plain click opens the source page only while
un-zoomed.

**Download** renders the current three as a single JPEG — mat panels,
plate numerals, titles, and source attributions baked in. Each panel
exports the crop it's currently showing, so a zoomed detail saves as that
detail (sharpness is bounded by the source image's resolution). Two
archives (the Met, Cleveland) don't send CORS headers on their images, so
browsers forbid embedding their pixels — no client-side workaround
exists; those panels export as caption cards with the source link
instead. The Download button's tooltip warns you beforehand, and those
images can still be saved by hand from the source page. Reroll the slot
to another source if you want all three embedded.

Sketchfab-backed images (Global Digital Heritage scans and the geometry /
electronics model searches) get a small **3D** button in the slot bar:
it swaps the still render for Sketchfab's interactive embed viewer, so
you can orbit the model with the mouse. Click again to return to the
still. If a viewer is open when you hit Download, that panel exports
**your current camera angle** (captured through Sketchfab's screenshot
API); otherwise the still is used.

The last 10 sets are kept as history — step through them with the ‹ ›
buttons or <kbd>←</kbd>/<kbd>→</kbd>. Every state counts (full sets and
single-slot rerolls), stepping back restores the dropdowns that produced
that set, history survives page reloads, and changing anything while
viewing an old set branches from there like an undo stack.

Categories are picked from a visual panel: collapsible groups, each
category a tile with a thumbnail behind its label. The thumbnails ship
with the site as `thumbs/<category>.jpg` — 300×170, about 16KB each,
715KB for all 44 — so they appear instantly and nothing is fetched or
cached at runtime. Collapsed groups are `display:none`, so only the group
you have open loads at all. The underlying `<select>` is still there,
hidden, as the state model.

To rebuild the tiles (or refresh one you don't like):

```
node scripts/build-thumbs.mjs            # fills in anything missing
node scripts/build-thumbs.mjs textures   # replaces just this one
```

It picks each image using that category's own Commons query, crops it
with macOS `sips` (no dependencies), and records every source in
[thumbs/CREDITS.md](thumbs/CREDITS.md). Existing files are left alone
unless you name them, so tiles you like stay put.

Categories are organized by practice intent, in five groups:

- **Artist** — poses & figure, anatomy, clothing & drapery, textures,
  landscape, environments, interiors, study sculpture, hard surface &
  machines, devices & instruments, retro electronics (transistor radios,
  CRTs, synths, tape decks, vacuum tubes)
- **Nature** — flowers, trees, shrubs & hedges, botanical plates, birds,
  mammals, insects, marine life, zoological plates
- **Photography** — props & still life, costume, lighting, atmosphere,
  biome, documentary & street, early color & photochrom, portrait photography
- **Cinematography** — modern cinema (film frames via TMDB, for colour and
  lighting study; needs a free key), public domain cinema (lobby cards,
  early frame grabs, silent-era scene stills)
- **Design** — typography & lettering, posters, brand marks & ex libris,
  layout & editorial, abstract, polyhedra & solids, curves & topology
  (Klein bottles, Möbius strips, minimal surfaces, fractals, Chladni
  figures…), ornament, maps, charts
- **Archive** — paintings, photographs, portraits, manuscripts,
  architecture, objects & artifacts

These are not API vocabulary: each category is a *recipe* in
[categories.js](categories.js) — a set of count-tested queries across
several archives (Commons title/phrase heuristics, IA subjects, Met
mediums, Cleveland types, Smithsonian units, patent drawings, Muybridge
plates…). Edit that file to tune a category or add your own. Categories
marked `modern: true` (textures, atmosphere, biome) accept present-day
Commons photography; the rest lean archival.

No build step, no dependencies — five static files.

## Run it

Any static file server works. From this folder:

```
python3 -m http.server 8137
```

then open <http://localhost:8137>. (Opening `index.html` directly as a
`file://` URL won't work — the archive APIs need a real http origin.)

To put it online, drop the folder on GitHub Pages, Netlify, or any static
host as-is.

## Sources

Live now, no key needed:

| Source | API |
|---|---|
| Internet Archive | `archive.org/advancedsearch.php` + IIIF image service |
| Library of Congress | its 630k-file Commons collection (`incategory:"Images from the Library of Congress"`) — loc.gov's own API blocks browser fetches |
| The Met | `collectionapi.metmuseum.org`, `medium`-scoped |
| Wikimedia Commons | `commons.wikimedia.org/w/api.php`, `intitle:`/phrase queries |
| Cleveland Museum of Art | `openaccess-api.clevelandart.org`, `type`-scoped (replaced Art Institute of Chicago, whose image CDN blocks hotlinking) |
| Global Digital Heritage | their 3D-scan captures via `api.sketchfab.com` |
| Sketchfab | model-search render thumbnails (geometry categories only), linking to the model page |
| Victoria & Albert Museum | `api.vam.ac.uk`, IIIF images — design and decorative arts (91k textiles, 66k ceramics, 45k costume, 20k posters) |
| Wellcome Collection | `api.wellcomecollection.org`, IIIF images — anatomical and natural-history illustration |
| Science Museum Group | `collection.sciencemuseumgroup.org.uk` — machines and instruments (6.3k microscopes, 4.5k cameras, 1.8k radios, 2.2k locomotives). Needs an explicit `Accept: application/json` header, otherwise it redirects to HTML; their CloudFront also rejects unknown user-agents, which looks like a 403 auth wall from `curl` but never affects a browser |

Wired up but **off by default**:

| Source | Why |
|---|---|
| Smithsonian Open Access | `api.si.edu` search works and the key is in [config.js](config.js), but every image on `ids.si.edu` now fails to load cross-origin in a browser (0/12 in testing) while returning a normal 200 to `curl` — their bot defense issues `TS…` cookies a browser won't replay on an image request. Set `smithsonianImages: true` in config.js to retest. |
| Europeana | needs a free key — get one at <https://pro.europeana.eu/page/get-api> and paste it into [config.js](config.js) |
| TMDB | needs a free key — <https://www.themoviedb.org/settings/api>. Powers **Modern cinema**, whose frames are studio copyright rather than open, shown under TMDB's API terms. The attribution line in the about panel is required by those terms; leave it in place. Without a key the category shows as unavailable and only Public domain cinema answers. |

Note: anything in `config.js` ships with the site. If you deploy publicly,
that includes your Smithsonian key — it's free and rate-limited, but if you
care, regenerate it at <https://api.data.gov/signup> and keep the public
copy blank.

Not every source covers every category — each provider only claims
categories it can filter *structurally* (subject fields, medium, museum
unit, title match), because plain full-text search returns off-topic
results. "Anything" maps to a random supported category per provider.

## How it picks images

Each slot filters the source list to providers that cover its category,
orders them by weighted random, and pulls from a shuffled, cached pool
(30-minute session cache, so rerolls are fast and the APIs aren't hammered).
The last ~90 shown items are remembered in `localStorage` and skipped, so
refreshing keeps bringing new material. If a provider or image fails, the
slot quietly falls through to the next one.

Category choices persist between visits. "Anything" maps to a random
category per provider, so even the unfiltered feed stays varied.

### Why results are on-topic (and how to keep them that way)

No archive shares a vocabulary, and only some have real tagging, so
precision comes from four rules — worth knowing if you edit
[categories.js](categories.js):

1. **Prefer structural filters to free text.** `medium=Paintings` (Met),
   `type=Sculpture` (Cleveland), `unit_code:"NPG"` (Smithsonian) and
   `subject:` (Internet Archive) are indexed fields. A bare `q=` search
   matches *any* field — donor names, gallery notes — which is how
   "botanical" once returned a Jesus painting.
2. **Sample by relevance, not at random.** Commons queries take the
   relevance-ranked head with a randomised offset (0–225) instead of
   `sort=random`. Random draws uniformly from the whole match set, whose
   tail is mostly incidental filename matches; relevance puts genuine
   subjects first. This one change fixed more noise than any query
   rewrite.
3. **Anchor text to titles and categories.** `intitle:` and
   `incategory:"…"` (curated human taxonomy) beat description matches.
   `haswbstatement:P180=Q…` is Commons' structured *depicts* tag, best
   for subject-like things — note it means "appears in the image", so a
   hotel-room photo counts as depicting a television.
4. **Watch for homonyms.** Verified traps: "type specimen" is a holotype
   in biology, `intitle:lettering` is mostly ship-hull names,
   `intitle:tesseract` is a music festival, "stellated" on Sketchfab is
   stellate neurons.

Two filters run on every Commons pool: a junk-title blocklist (game
assets, screenshots) and near-duplicate collapsing, since relevance order
tends to cluster batch uploads of one subject.

## Planned

- **Threads** — a one-line "what binds them?" note per set. Noted sets
  get promoted to a permanent local archive (unnoted ones stay
  disposable), the line gets baked into downloads, a "threads" panel
  lists and restores them, and a Markdown export turns them into
  zettels for Obsidian/Logseq — the Zettelkasten bridge.
- **Color search** — pick a color per slot: client-side thumbnail
  matching for the CORS-friendly archives, plus native color search via
  Europeana's `colourpalette` and a possible Rijksmuseum source (both
  free keys).
- **Europeana activation** — paste a free key
  (<https://pro.europeana.eu/page/get-api>) into config.js and the
  dormant provider wakes up.
