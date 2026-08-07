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

Categories are organized by practice intent, in four groups:

- **Artist** — poses & figure, anatomy, clothing & drapery, textures,
  landscape, environments, interiors, study sculpture, hard surface &
  machines, devices & instruments, retro electronics (transistor radios,
  CRTs, synths, tape decks, vacuum tubes), animals & creatures
- **Photography** — props & still life, costume, lighting, atmosphere,
  biome, documentary & street, early color & photochrom, portrait photography
- **Design** — typography & lettering, posters, brand marks & ex libris,
  layout & editorial, abstract, polyhedra & solids, curves & topology
  (Klein bottles, Möbius strips, minimal surfaces, fractals, Chladni
  figures…), ornament, maps, charts
- **Archive** — paintings, photographs, portraits, manuscripts,
  architecture, botanical, objects & artifacts

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
| Smithsonian Open Access | `api.si.edu`, unit-scoped (SAAM, Cooper Hewitt, NPG, herbarium); key lives in [config.js](config.js) |

Dormant until you paste a free key into [config.js](config.js):

| Source | Get a key |
|---|---|
| Europeana | <https://pro.europeana.eu/page/get-api> |

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
