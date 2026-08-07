/* Archive providers. Each is an executor for the recipe payloads defined in
   categories.js: given a category, it picks one of that category's query
   variants for this provider and turns it into a pool of normalized items
   { img, fallback, title, link }. All requests run client-side; every API
   here sends CORS headers. */

"use strict";

const rnd = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rnd(arr.length)];

async function getJSON(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
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

/* Shared Commons search → pool (Wikimedia Commons + the Commons-hosted
   Library of Congress collection). */
async function commonsPool(search) {
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*` +
    `&generator=search&gsrsearch=${encodeURIComponent(search + " filetype:bitmap")}` +
    `&gsrnamespace=6&gsrlimit=25&gsrsort=random` +
    `&prop=imageinfo&iiprop=url%7Cmime&iiurlwidth=1280`;
  const data = await getJSON(url);
  const pages = Object.values(data?.query?.pages ?? {});
  return pages
    .map((p) => {
      const ii = p.imageinfo?.[0];
      if (!ii?.thumburl) return null;
      if (ii.mime && !/^image\/(jpeg|png|gif|webp)/.test(ii.mime)) return null;
      const title = asText(p.title).replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "");
      return {
        img: ii.thumburl,
        fallback: null,
        title: title || "Untitled",
        link: ii.descriptionurl || `https://commons.wikimedia.org/?curid=${p.pageid}`,
      };
    })
    .filter(Boolean);
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
      const { variant } = pickVariant(this.id, cat);
      return commonsPool(variant);
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

  /* ---- Smithsonian Open Access (needs free key) -------------------------- */
  /* Search rows only carry image URLs for museum units that photograph
     objects, so recipes are unit-scoped; the separate fq param is ignored
     by the API, so filters live inside q. */
  {
    id: "si",
    name: "Smithsonian",
    weight: 1,
    enabled: () => !!window.ARCHIVE_KEYS?.smithsonian,
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
