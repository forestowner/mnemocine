/* Archive providers. Each is an executor for the recipe payloads defined in
   categories.js: given a category, it picks one of that category's query
   variants for this provider and turns it into a pool of normalized items
   { img, fallback, title, link }. All requests run client-side; every API
   here sends CORS headers. */

"use strict";

const rnd = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rnd(arr.length)];

async function getJSON(url, timeoutMs = 12000, headers) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function asText(value) {
  if (Array.isArray(value)) value = value[0];
  return (value == null ? "" : String(value)).replace(/\s+/g, " ").trim();
}

/* Resolve a category to a concrete recipe variant for a provider.
   "any" picks a random category the provider serves. */
function pickVariant(providerId, cat) {
  const effective =
    cat === "any" || !RECIPES[cat]?.[providerId]
      ? pick(PROVIDER_CATS[providerId])
      : cat;
  return { effective, variant: pick(RECIPES[effective][providerId]) };
}

function providerSupports(providerId, cat) {
  return cat === "any"
    ? (PROVIDER_CATS[providerId] || []).length > 0
    : !!RECIPES[cat]?.[providerId];
}

/* Shared Sketchfab response → pool (Global Digital Heritage + model search). */
function sketchfabItems(data) {
  return (data?.results ?? [])
    .map((m) => {
      const sizes = [...(m.thumbnails?.images ?? [])]
        .sort((a, b) => (b.width || 0) - (a.width || 0));
      if (!sizes.length) return null;
      const best = sizes[0];
      const mid = sizes.find((t) => t !== best && (t.width || 0) <= 1024);
      return {
        img: best.url,
        fallback: mid ? mid.url : null,
        title: m.name && m.name !== "none" ? asText(m.name) : "3D capture",
        link: m.viewerUrl,
        sfEmbed: m.embedUrl || (m.uid ? `https://sketchfab.com/models/${m.uid}/embed` : null),
      };
    })
    .filter(Boolean);
}

/* Titles that mean "not a reference image". Commons text search pulls in
   dense clusters of game/dev assets and software captures — a search for
   `intitle:texture` is half Minetest tile dumps by page 5. */
const JUNK_TITLE =
  /minetest|texture[ -]?pack|opengl|\bshader\b|screenshot|sprite ?sheet|placeholder|test ?card|\bmockup\b/i;

/* Shared Commons search → pool (Wikimedia Commons + the Commons-hosted
   Library of Congress collection).

   Sampling note: this used to ask for `gsrsort=random`, which draws
   uniformly from the whole match set — and for a text query the tail is
   mostly incidental matches (batch-numbered snapshots that merely have
   the word in their filename). Relevance order puts genuine subjects
   first, so instead we keep relevance and randomise a bounded OFFSET
   into its head. Variety now comes from the offset plus the several
   query variants each category carries. */
async function commonsPool(search) {
  const fetchAt = async (offset) => {
    const url =
      `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*` +
      `&generator=search&gsrsearch=${encodeURIComponent(search + " filetype:bitmap")}` +
      `&gsrnamespace=6&gsrlimit=25&gsroffset=${offset}` +
      `&prop=imageinfo&iiprop=url%7Cmime&iiurlwidth=1280`;
    const data = await getJSON(url);
    return Object.values(data?.query?.pages ?? {});
  };
  /* Relevance order also clusters batch uploads — twenty near-identical
     frames of one subject in a row — so keep one per normalised title.
     seenSubject is shared across pages so top-ups don't reintroduce
     what the first page already dropped. */
  const seenSubject = new Set();
  const build = (pages) =>
    pages
      .map((p) => {
        const ii = p.imageinfo?.[0];
        if (!ii?.thumburl) return null;
        if (ii.mime && !/^image\/(jpeg|png|gif|webp)/.test(ii.mime)) return null;
        const title = asText(p.title).replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "");
        if (JUNK_TITLE.test(title)) return null;
        const subject = title.toLowerCase().replace(/[\d\W_]+/g, " ").trim().slice(0, 38);
        if (subject && seenSubject.has(subject)) return null;
        seenSubject.add(subject);
        return {
          img: ii.thumburl,
          fallback: null,
          title: title || "Untitled",
          link: ii.descriptionurl || `https://commons.wikimedia.org/?curid=${p.pageid}`,
        };
      })
      .filter(Boolean);

  const first = rnd(10) * 25; // 0–225, relevance-ranked head
  let items = build(await fetchAt(first));
  /* a page can collapse to almost nothing once duplicates are dropped */
  if (items.length < 8) items = items.concat(build(await fetchAt(first + 250)));
  if (items.length < 4 && first !== 0) items = items.concat(build(await fetchAt(0)));
  return items;
}

const PROVIDERS = [

  /* ---- Internet Archive ------------------------------------------------ */
  {
    id: "ia",
    name: "Internet Archive",
    weight: 1,
    enabled: () => true,
    supports(cat) { return providerSupports(this.id, cat); },
    async fetchPool(cat) {
      const { variant } = pickVariant(this.id, cat);
      const q = `(${variant}) AND mediatype:(image)`;
      const base = (page) =>
        `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}` +
        `&fl[]=identifier&fl[]=title&rows=50&page=${page}&output=json`;
      let data = await getJSON(base(1 + rnd(12)));
      let docs = data?.response?.docs ?? [];
      if (!docs.length) {
        data = await getJSON(base(1));
        docs = data?.response?.docs ?? [];
      }
      return docs.map((d) => ({
        img: `https://iiif.archive.org/iiif/${encodeURIComponent(d.identifier)}/full/!1400,1400/0/default.jpg`,
        fallback: `https://archive.org/services/img/${encodeURIComponent(d.identifier)}`,
        title: asText(d.title) || d.identifier,
        link: `https://archive.org/details/${d.identifier}`,
      }));
    },
  },

  /* ---- Library of Congress (via its Wikimedia Commons collection) -------- */
  /* loc.gov's own JSON API rejects cross-origin browser fetches, so this
     pulls from the 630k-file LoC category on Commons — same collection,
     reachable API. */
  {
    id: "loc",
    name: "Library of Congress",
    weight: 1,
    enabled: () => true,
    supports(cat) { return providerSupports(this.id, cat); },
    async fetchPool(cat) {
      const { variant } = pickVariant(this.id, cat);
      return commonsPool(variant);
    },
  },

  /* ---- Europeana (needs free key) -------------------------------------- */
  {
    id: "europeana",
    name: "Europeana",
    weight: 1,
    enabled: () => !!window.ARCHIVE_KEYS?.europeana,
    supports(cat) { return providerSupports(this.id, cat); },
    async fetchPool(cat) {
      const { variant } = pickVariant(this.id, cat);
      const url =
        `https://api.europeana.eu/record/v2/search.json` +
        `?wskey=${encodeURIComponent(window.ARCHIVE_KEYS.europeana)}` +
        `&query=${encodeURIComponent(variant)}&qf=TYPE%3AIMAGE&media=true` +
        `&rows=48&profile=standard&sort=random%2Ceuropeana_id`;
      const data = await getJSON(url);
      return (data?.items ?? [])
        .filter((i) => i.edmPreview?.[0] || i.edmIsShownBy?.[0])
        .map((i) => ({
          img: i.edmIsShownBy?.[0] || i.edmPreview[0],
          fallback: i.edmPreview?.[0] || null,
          title: asText(i.title) || "Untitled",
          link: i.guid,
        }));
    },
  },

  /* ---- Global Digital Heritage (via Sketchfab) -------------------------- */
  {
    id: "gdh",
    name: "Global Digital Heritage",
    weight: 0.5,
    enabled: () => true,
    supports(cat) { return providerSupports(this.id, cat); },
    async fetchPool() {
      const sort = pick(["-publishedAt", "publishedAt", "-likeCount", "-viewCount"]);
      let data = await getJSON(
        `https://api.sketchfab.com/v3/models?user=GlobalDigitalHeritage&count=24&sort_by=${sort}`
      );
      for (let hop = rnd(4); hop > 0 && data?.next; hop--) {
        data = await getJSON(data.next);
      }
      return sketchfabItems(data);
    },
  },

  /* ---- Sketchfab model search (geometry render thumbnails) --------------- */
  {
    id: "sf",
    name: "Sketchfab",
    weight: 0.5,
    enabled: () => true,
    supports(cat) { return providerSupports(this.id, cat); },
    async fetchPool(cat) {
      const { variant } = pickVariant(this.id, cat);
      const sort = pick(["-likeCount", "-viewCount", "-publishedAt"]);
      let data = await getJSON(
        `https://api.sketchfab.com/v3/search?type=models` +
        `&q=${encodeURIComponent(variant)}&count=24&sort_by=${sort}`
      );
      for (let hop = rnd(3); hop > 0 && data?.next; hop--) {
        data = await getJSON(data.next);
      }
      return sketchfabItems(data);
    },
  },

  /* ---- The Met ----------------------------------------------------------- */
  /* q fuzzy-matches every field and tags/title params are broken, so recipes
     always carry a structural `medium`; q only biases relevance inside it. */
  {
    id: "met",
    name: "The Met",
    weight: 1,
    enabled: () => true,
    supports(cat) { return providerSupports(this.id, cat); },
    async fetchPool(cat) {
      const { effective, variant } = pickVariant(this.id, cat);
      const cacheKey = `triptych.metIds.v3.${effective}`;
      let ids = null;
      try {
        const cached = JSON.parse(sessionStorage.getItem(cacheKey));
        if (cached && Date.now() - cached.t < 30 * 60e3) ids = cached.ids;
      } catch { /* re-fetch */ }
      if (!ids) {
        const data = await getJSON(
          `https://collectionapi.metmuseum.org/public/collection/v1/search` +
          `?q=${encodeURIComponent(variant.q)}&hasImages=true` +
          `&medium=${encodeURIComponent(variant.medium)}`
        );
        ids = (data?.objectIDs ?? []).slice(0, 3000);
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), ids }));
        } catch { /* storage full — fine */ }
      }
      if (!ids.length) return [];
      const out = [];
      const tried = new Set();
      for (let i = 0; i < 8 && out.length < 4 && tried.size < ids.length; i++) {
        const id = ids[rnd(ids.length)];
        if (tried.has(id)) continue;
        tried.add(id);
        try {
          const o = await getJSON(
            `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`
          );
          const img = o?.primaryImageSmall || o?.primaryImage;
          if (!img) continue;
          out.push({
            img,
            fallback: o.primaryImage && o.primaryImage !== img ? o.primaryImage : null,
            title: asText(o.title) || "Untitled",
            link: o.objectURL || `https://www.metmuseum.org/art/collection/search/${id}`,
          });
        } catch { /* skip this object */ }
      }
      return out;
    },
  },

  /* ---- Wikimedia Commons ------------------------------------------------ */
  {
    id: "wm",
    name: "Wikimedia Commons",
    weight: 1,
    enabled: () => true,
    supports(cat) { return providerSupports(this.id, cat); },
    async fetchPool(cat) {
      const { effective } = pickVariant(this.id, cat);
      const variants = RECIPES[effective]?.wm ?? [];
      /* Draw from three of the category's queries at once. A pool built
         from a single query is 25 photographs of the same noun, so Props
         would serve two dozen vases before it ever reached the boots. */
      const bag = [...variants];
      const chosen = [];
      while (chosen.length < 3 && bag.length) {
        chosen.push(bag.splice(rnd(bag.length), 1)[0]);
      }
      const results = await Promise.all(
        chosen.map((v) => commonsPool(v).catch(() => []))
      );
      return results.flat();
    },
  },

  /* ---- Cleveland Museum of Art ------------------------------------------- */
  {
    id: "cma",
    name: "Cleveland Museum of Art",
    short: "Cleveland Museum",
    weight: 1,
    enabled: () => true,
    supports(cat) { return providerSupports(this.id, cat); },
    async fetchPool(cat) {
      const { effective, variant } = pickVariant(this.id, cat);
      const totalKey = `triptych.cmaTotal.v3.${effective}`;
      let total = null;
      try { total = JSON.parse(sessionStorage.getItem(totalKey)); } catch { /* first run */ }
      const window_ = total ? Math.max(1, Math.min(total, 1000) - 40) : 1;
      const base = (skip) =>
        `https://openaccess-api.clevelandart.org/api/artworks/` +
        `?has_image=1&limit=40&skip=${skip}&${variant}`;
      let data = await getJSON(base(rnd(window_)));
      let works = data?.data ?? [];
      if (!works.length) {
        data = await getJSON(base(0));
        works = data?.data ?? [];
      }
      const found = data?.info?.total;
      if (found) {
        try { sessionStorage.setItem(totalKey, JSON.stringify(found)); } catch { /* fine */ }
      }
      return works
        .map((a) => {
          const img = a.images?.web?.url;
          if (!img) return null;
          return {
            img,
            fallback: null,
            title: asText(a.title) || "Untitled",
            link: a.url || `https://www.clevelandart.org/art/${a.accession_number}`,
          };
        })
        .filter(Boolean);
    },
  },

  /* ---- Victoria & Albert Museum (no key) --------------------------------- */
  /* Took over the design/decorative-arts role Cooper Hewitt used to play
     via Smithsonian. Key-free, CORS-open, IIIF images that load in a
     browser — and deep where it counts: 91k textiles, 45k costume,
     66k ceramics. */
  {
    id: "va",
    name: "Victoria & Albert Museum",
    short: "V&A",
    weight: 1,
    enabled: () => true,
    supports(cat) { return providerSupports(this.id, cat); },
    async fetchPool(cat) {
      const { effective, variant } = pickVariant(this.id, cat);
      const pagesKey = `mnemocine.vaPages.${effective}`;
      let pages = null;
      try { pages = JSON.parse(sessionStorage.getItem(pagesKey)); } catch { /* first run */ }
      const page = 1 + rnd(Math.max(1, Math.min(pages || 1, 25)));
      const url =
        `https://api.vam.ac.uk/v2/objects/search?q=${encodeURIComponent(variant)}` +
        `&images_exist=1&page_size=40&page=${page}`;
      const data = await getJSON(url);
      const found = data?.info?.pages;
      if (found) {
        try { sessionStorage.setItem(pagesKey, JSON.stringify(found)); } catch { /* fine */ }
      }
      return (data?.records ?? [])
        .map((r) => {
          const base = r._images?._iiif_image_base_url;
          if (!base) return null;
          return {
            img: `${base}full/!1200,1200/0/default.jpg`,
            fallback: `${base}full/!600,600/0/default.jpg`,
            title: asText(r._primaryTitle) || asText(r.objectType) || "Untitled",
            link: `https://collections.vam.ac.uk/item/${r.systemNumber}`,
          };
        })
        .filter(Boolean);
    },
  },

  /* ---- Wellcome Collection (no key) -------------------------------------- */
  /* Medical, anatomical and natural-history illustration, openly licensed
     and served over IIIF. */
  {
    id: "well",
    name: "Wellcome Collection",
    short: "Wellcome",
    weight: 1,
    enabled: () => true,
    supports(cat) { return providerSupports(this.id, cat); },
    async fetchPool(cat) {
      const { effective, variant } = pickVariant(this.id, cat);
      const pagesKey = `mnemocine.wellPages.${effective}`;
      let pages = null;
      try { pages = JSON.parse(sessionStorage.getItem(pagesKey)); } catch { /* first run */ }
      const page = 1 + rnd(Math.max(1, Math.min(pages || 1, 20)));
      const url =
        `https://api.wellcomecollection.org/catalogue/v2/works` +
        `?query=${encodeURIComponent(variant)}` +
        `&items.locations.license=pdm,cc0,cc-by&workType=k,q` +
        `&include=items&pageSize=40&page=${page}`;
      const data = await getJSON(url);
      const found = data?.totalPages;
      if (found) {
        try { sessionStorage.setItem(pagesKey, JSON.stringify(found)); } catch { /* fine */ }
      }
      return (data?.results ?? [])
        .map((w) => {
          const loc = (w.items ?? [])
            .flatMap((it) => it.locations ?? [])
            .find((l) => l.locationType?.id === "iiif-image" && l.url);
          if (!loc) return null;
          const stem = loc.url.replace(/\/info\.json$/, "");
          return {
            img: `${stem}/full/1200,/0/default.jpg`,
            fallback: `${stem}/full/600,/0/default.jpg`,
            title: asText(w.title) || "Untitled",
            link: `https://wellcomecollection.org/works/${w.id}`,
          };
        })
        .filter(Boolean);
    },
  },

  /* ---- TMDB (needs a free key) ------------------------------------------- */
  /* The one source here whose images are copyrighted rather than open:
     studio promotional frames, used under TMDB's API terms, which permit
     display with attribution. Included because colour science and lighting
     are exactly what the public-domain film record cannot show. Their CDN
     sends `Access-Control-Allow-Origin: *`, so frames display fine. */
  {
    id: "tmdb",
    name: "TMDB",
    weight: 1,
    enabled: () => !!window.ARCHIVE_KEYS?.tmdb,
    supports(cat) { return providerSupports(this.id, cat); },
    async fetchPool(cat) {
      const { variant } = pickVariant(this.id, cat);
      const key = encodeURIComponent(window.ARCHIVE_KEYS.tmdb);
      const page = 1 + rnd(12);
      const list = await getJSON(
        `https://api.themoviedb.org/3/discover/movie?api_key=${key}` +
        `&include_adult=false&page=${page}&${variant}`
      );
      const results = list?.results ?? [];
      if (!results.length) return [];

      /* A film's own /images set is where the real frames are. A movie's
         single `backdrop_path` is the curated hero image, which is usually
         key art — title treatments, cast composites — not a shot from the
         film. Within /images, the textless entries (no language tag) are
         the frames; anything carrying a language is artwork with type on
         it. One film can offer 80 of them at 3840x2160. */
      const chosen = [];
      const pool = [...results];
      while (chosen.length < 4 && pool.length) {
        chosen.push(pool.splice(rnd(pool.length), 1)[0]);
      }

      const perFilm = await Promise.all(
        chosen.map(async (m) => {
          try {
            const imgs = await getJSON(
              `https://api.themoviedb.org/3/movie/${m.id}/images?api_key=${key}`
            );
            const year = (m.release_date || "").slice(0, 4);
            const textless = (imgs?.backdrops ?? []).filter(
              (b) =>
                !b.iso_639_1 &&                 // no title treatment on it
                (b.aspect_ratio || 0) >= 1.7 && // not a cropped promo panel
                (b.width || 0) >= 1280
            );
            /* Two signals separate frames from promotional artwork, since
               TMDB doesn't label them:

               1. Nobody votes on frame #47 of a bulk upload, whereas the
                  painted key art is exactly what people do vote for. So
                  vote_count 0 is a good "not curated art" marker — and
                  taking TMDB's default order was actively wrong, because
                  it sorts by votes and hands back the artwork first.
               2. Frames arrive in bulk at one size, so the largest
                  same-size cluster is nearly all film.

               A film with only a handful of unvoted frames is one whose
               uploads are mostly art (To Kill a Mockingbird has 4, and
               served a colourised composite), so it sits this round out
               and the other films in the batch cover for it. */
            const unvoted = textless.filter((b) => !b.vote_count);
            const bySize = new Map();
            for (const b of unvoted) {
              const size = `${b.width}x${b.height}`;
              bySize.set(size, [...(bySize.get(size) ?? []), b]);
            }
            const biggest = [...bySize.values()].sort((a, b) => b.length - a.length)[0];
            const candidates = biggest?.length >= 6 ? biggest : [];
            const picked = [];
            const bag = [...candidates];
            while (picked.length < 8 && bag.length) {
              picked.push(bag.splice(rnd(bag.length), 1)[0]);
            }
            return picked
              .map((b) => ({
                img: `https://image.tmdb.org/t/p/w1280${b.file_path}`,
                fallback: `https://image.tmdb.org/t/p/w780${b.file_path}`,
                /* the frame at full resolution — a film's TMDB page holds
                   hundreds of images and no way to find this one */
                imgLink: `https://image.tmdb.org/t/p/original${b.file_path}`,
                title: [asText(m.title), year].filter(Boolean).join(" "),
                /* the film's backdrop gallery, so the caption is a way
                   into the rest of that film's frames */
                link: `https://www.themoviedb.org/movie/${m.id}/images/backdrops`,
              }));
          } catch {
            return [];
          }
        })
      );

      const frames = perFilm.flat();
      if (frames.length) return frames;

      /* Nothing textless on offer — fall back to hero backdrops rather
         than leaving the slot empty. */
      return results
        .filter((m) => m.backdrop_path)
        .map((m) => ({
          img: `https://image.tmdb.org/t/p/w1280${m.backdrop_path}`,
          fallback: `https://image.tmdb.org/t/p/w780${m.backdrop_path}`,
          imgLink: `https://image.tmdb.org/t/p/original${m.backdrop_path}`,
          title: [asText(m.title), (m.release_date || "").slice(0, 4)]
            .filter(Boolean)
            .join(" "),
          link: `https://www.themoviedb.org/movie/${m.id}/images/backdrops`,
        }));
    },
  },

  /* ---- Science Museum Group (no key) ------------------------------------- */
  /* Their CloudFront blocks unknown user-agents, which reads as a 403 and
     looks like an auth wall — it isn't. A browser sends its own UA, so the
     only thing this needs is an explicit Accept header; without it the API
     302s to the HTML page. Deep on exactly the machine-made things the
     other archives are thin on: 6.3k microscopes, 4.5k cameras, 1.8k
     radios, 2.2k locomotives. */
  {
    id: "smg",
    name: "Science Museum Group",
    short: "Science Museum",
    weight: 1,
    enabled: () => true,
    supports(cat) { return providerSupports(this.id, cat); },
    async fetchPool(cat) {
      const { effective, variant } = pickVariant(this.id, cat);
      const pagesKey = `mnemocine.smgPages.${effective}`;
      let pages = null;
      try { pages = JSON.parse(sessionStorage.getItem(pagesKey)); } catch { /* first run */ }
      const page = 1 + rnd(Math.max(1, Math.min(pages || 1, 25)));
      const url =
        `https://collection.sciencemuseumgroup.org.uk/search/objects` +
        `?q=${encodeURIComponent(variant)}&has_image=true` +
        `&page%5Bsize%5D=40&page%5Bnumber%5D=${page}`;
      const data = await getJSON(url, 12000, { Accept: "application/json" });
      const total = data?.meta?.count?.type?.objects;
      if (total) {
        try {
          sessionStorage.setItem(pagesKey, JSON.stringify(Math.ceil(total / 40)));
        } catch { /* fine */ }
      }
      return (data?.data ?? [])
        .map((rec) => {
          const proc = rec.attributes?.multimedia?.[0]?.["@processed"] ?? {};
          const loc = proc.large?.location || proc.medium?.location;
          if (!loc) return null;
          const thumb = proc.large_thumbnail?.location;
          const CDN = "https://coimages.sciencemuseumgroup.org.uk/";
          return {
            img: CDN + loc,
            fallback: thumb ? CDN + thumb : null,
            title: asText(rec.attributes?.summary?.title) || "Untitled",
            link: `https://collection.sciencemuseumgroup.org.uk/objects/${rec.id}`,
          };
        })
        .filter(Boolean);
    },
  },

  /* ---- Smithsonian Open Access (needs free key) -------------------------- */
  /* Search rows only carry image URLs for museum units that photograph
     objects, so recipes are unit-scoped; the separate fq param is ignored
     by the API, so filters live inside q. */
  {
    id: "si",
    name: "Smithsonian",
    weight: 1,
    /* OFF by default (2026-08-08). The search API works fine, but every
       image on ids.si.edu now fails to load cross-origin in a browser —
       0/12 in testing — while returning a normal 200 to curl. Their F5
       bot-defense hands out `TS…` cookies that browsers won't replay on a
       cross-site image request, and no client-side workaround exists.
       Flip `smithsonianImages` on in config.js to try it again. */
    enabled: () =>
      !!window.ARCHIVE_KEYS?.smithsonian && !!window.ARCHIVE_KEYS?.smithsonianImages,
    supports(cat) { return providerSupports(this.id, cat); },
    async fetchPool(cat) {
      const { variant } = pickVariant(this.id, cat);
      const q = `(${variant}) AND online_media_type:"Images"`;
      const base = (start) =>
        `https://api.si.edu/openaccess/api/v1.0/search` +
        `?api_key=${encodeURIComponent(window.ARCHIVE_KEYS.smithsonian)}` +
        `&q=${encodeURIComponent(q)}&rows=40&start=${start}`;
      let data = await getJSON(base(rnd(8) * 40));
      let rows = data?.response?.rows ?? [];
      if (!rows.length) {
        data = await getJSON(base(0));
        rows = data?.response?.rows ?? [];
      }
      return rows
        .map((r) => {
          const dn = r.content?.descriptiveNonRepeating;
          const media = (dn?.online_media?.media ?? []).find(
            (m) => m?.content || m?.thumbnail
          );
          if (!media) return null;
          let img = media.content || media.thumbnail;
          if (img.includes("deliveryService") && !/[?&]max/.test(img)) {
            img += (img.includes("?") ? "&" : "?") + "max=1400";
          }
          const thumb =
            media.thumbnail && media.thumbnail !== img ? media.thumbnail : null;
          return {
            img,
            fallback: thumb,
            title: asText(dn?.title?.content) || asText(r.title) || "Untitled",
            link:
              dn?.record_link ||
              dn?.guid ||
              `https://www.si.edu/object/${r.url || r.id}`,
          };
        })
        .filter(Boolean);
    },
  },
];
