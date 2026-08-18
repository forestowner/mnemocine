/* Triptych taxonomy: practice-intent categories mapped to hand-tuned,
   count-tested queries per archive ("recipes"). The dropdown shows the
   groups; the recipes are the middle ground between what the user looks
   for and what each API can actually filter.

   Recipe payload shapes by provider:
     ia  — advancedsearch subject/collection expression (wrapped by executor)
     wm  — Wikimedia Commons search string
     loc — Commons search string scoped to the Library of Congress category
     met — { q, medium } for collectionapi search
     cma — Cleveland openaccess URL params
     si  — Smithsonian EDAN q expression (unit-scoped)
     gdh — true (Sketchfab pool takes no query)
     europeana — search query (dormant until a key exists)

   Modern-photo policy: categories marked modern:true accept present-day
   Commons photography (textures, atmosphere, biome — they starve without
   it); everything else leans archival. */

"use strict";

const LOC_CAT = 'incategory:"Images from the Library of Congress"';

const CATEGORY_GROUPS = [
  {
    label: "Artist",
    cats: [
      { id: "poses", label: "Poses & figure" },
      { id: "anatomy", label: "Anatomy" },
      { id: "drapery", label: "Clothing & drapery" },
      { id: "textures", label: "Textures & materials", modern: true },
      { id: "landscape", label: "Landscape" },
      { id: "environments", label: "Environments & streets" },
      { id: "interiors", label: "Interiors" },
      { id: "sculpture", label: "Study sculpture" },
      { id: "hardsurface", label: "Hard surface & machines" },
      { id: "devices", label: "Devices & instruments" },
      { id: "electronics", label: "Retro electronics", modern: true },
    ],
  },
  {
    label: "Nature",
    cats: [
      { id: "flowers", label: "Flowers", modern: true },
      { id: "trees", label: "Trees", modern: true },
      { id: "shrubs", label: "Shrubs & hedges", modern: true },
      { id: "botanical", label: "Botanical plates" },
      { id: "birds", label: "Birds", modern: true },
      { id: "mammals", label: "Mammals", modern: true },
      { id: "insects", label: "Insects", modern: true },
      { id: "marine", label: "Marine life", modern: true },
      { id: "creatures", label: "Zoological plates" },
    ],
  },
  {
    label: "Photography",
    cats: [
      { id: "props", label: "Props & still life" },
      { id: "costume", label: "Costume & wardrobe" },
      { id: "lighting", label: "Lighting" },
      { id: "atmosphere", label: "Atmosphere & weather", modern: true },
      { id: "biome", label: "Biome & wilderness", modern: true },
      { id: "street", label: "Documentary & street" },
      { id: "earlycolor", label: "Early color & photochrom" },
      { id: "photoportraits", label: "Portrait photography" },
    ],
  },
  {
    label: "Design",
    cats: [
      { id: "typography", label: "Typography & lettering" },
      { id: "posters", label: "Posters" },
      { id: "brand", label: "Brand marks & ex libris" },
      { id: "editorial", label: "Layout & editorial" },
      { id: "abstract", label: "Abstract" },
      { id: "polyhedra", label: "Polyhedra & solids" },
      { id: "curves", label: "Curves & topology" },
      { id: "ornament", label: "Patterns & ornament" },
      { id: "maps", label: "Maps" },
      { id: "charts", label: "Charts & diagrams" },
    ],
  },
  {
    label: "Archive",
    cats: [
      { id: "paintings", label: "Paintings" },
      { id: "photos", label: "Photographs" },
      { id: "portraits", label: "Portraits" },
      { id: "manuscripts", label: "Manuscripts" },
      { id: "architecture", label: "Architecture" },
      { id: "objects", label: "Objects & artifacts" },
    ],
  },
];

const RECIPES = {
  /* ---------- Artist ---------- */
  poses: {
    ia: ['subject:(dance OR dancers OR gymnastics)',
         'subject:("figure drawing" OR "human figure" OR "life drawing")'],
    wm: ['intitle:"figure study"', 'Muybridge locomotion', '"nude study"', 'académie nude'],
    cma: ["type=Drawing&q=figure", "type=Drawing&q=nude"],
    met: [{ q: "figure", medium: "Sculpture" }],
  },
  anatomy: {
    ia: ['subject:(anatomy OR osteology OR "human anatomy")'],
    wm: ['"anatomical illustration"', "écorché", "intitle:anatomy"],
    well: ["anatomy", "skeleton", "dissection"],
  },
  drapery: {
    ia: ['subject:(costume OR "fashion plates" OR drapery)'],
    wm: ['"fashion plate"', '"drapery study"', '"costume design" drawing'],
    met: [{ q: "dress", medium: "Costume" }],
    va: ["dress", "embroidery"],
  },
  textures: {
    wm: ["intitle:texture", "peeling paint", "weathered wood surface", "rust macro"],
    si: ['unit_code:"NMNHMINSCI"'],
    ia: ["subject:(minerals OR geology OR petrology)"],
  },
  landscape: {
    cma: ["type=Painting&q=landscape"],
    met: [{ q: "landscape", medium: "Paintings" }],
    wm: ['"landscape painting"', "photochrom landscape"],
    loc: [`${LOC_CAT} intitle:landscape`],
    ia: ["subject:(landscapes)"],
    europeana: ['"landscape painting"'],
  },
  environments: {
    wm: ["intitle:cityscape", '"street scene" painting'],
    loc: [`${LOC_CAT} intitle:street`],
    ia: ['subject:(streets OR cityscape OR "city views")'],
  },
  interiors: {
    wm: ['incategory:"Interiors"', '"interior view"', '"church interior"',
         '"palace interior"'],
    loc: [`${LOC_CAT} intitle:interior`],
    ia: ['subject:(interiors OR "interior decoration")'],
    met: [{ q: "interior", medium: "Paintings" }],
    cma: ["type=Painting&q=interior"],
  },
  sculpture: {
    gdh: [true],
    met: [{ q: "figure", medium: "Sculpture" }],
    cma: ["type=Sculpture"],
    si: ['unit_code:"SAAM" AND object_type:"Sculpture"'],
    wm: ['"plaster cast" sculpture', "intitle:statue"],
  },
  hardsurface: {
    wm: ['incategory:"Patent drawings"', "patent drawing",
         "steam locomotive photograph", '"suit of armor"'],
    ia: ["subject:(machinery OR locomotives OR engines)"],
    smg: ["locomotive", "engine", "turbine", "machine tool"],
  },
  devices: {
    wm: ['incategory:"Scientific instruments"', "intitle:typewriter",
         '"scientific instrument"', "antique camera"],
    ia: ['subject:("scientific instruments" OR phonograph OR microscopes)'],
    smg: ["microscope", "camera", "telescope", "clock", "typewriter",
          "surveying instrument"],
  },
  /* Smithsonian sits electronics out: NMAH search rows carry no media and
     Cooper Hewitt's text match tested nearly empty (6 rows). */
  electronics: {
    /* intitle-anchored: description-text matches tested noisy here */
    wm: ['incategory:"Transistor radios"', 'intitle:"transistor radio"',
         'intitle:"television set"', 'intitle:"vacuum tube"',
         'intitle:"tape recorder"', "intitle:oscilloscope",
         "intitle:synthesizer", 'intitle:"home computer"',
         "intitle:gramophone", '"rotary telephone"'],
    loc: [`${LOC_CAT} intitle:radio`],
    ia: ['subject:("electronics" OR "consumer electronics")'],
    smg: ["radio", "television", "computer", "tape recorder", "oscilloscope",
          "telephone", "gramophone"],
    sf: ["retro tv", "vintage radio", "cassette player", "crt monitor", "synthesizer"],
  },

  /* ---------- Nature ----------
     Organisms are the one place Commons' structured "depicts" tag shines:
     they're photographed AS subjects. Two exceptions found by testing —
     P180=Q10884 (tree) and P180=Q152 (fish) return townscapes and plates
     of sashimi, because trees and fish mostly appear incidentally — so
     those two lean on curated categories instead. Smithsonian's natural
     history units are the deepest source here: 559k bird and 555k mammal
     specimens, nearly all with images. */
  /* Internet Archive's subject tags are unusable for live organisms —
     `subject:(mammals)` surfaced an eBay archive, `subject:(insects)` a
     1947 aircraft photo — so IA appears here only under Botanical and
     Zoological plates, where its natural-history books are the point. */
  flowers: {
    wm: ["haswbstatement:P180=Q506"],
    si: ['unit_code:"NMNHBOTANY"'],
    ia: ["subject:(flowers)"],
  },
  trees: {
    /* not intitle:tree — that is largely tree frogs */
    wm: ['incategory:"Trees"'],
    ia: ["subject:(trees OR dendrology)"],
  },
  shrubs: {
    wm: ["intitle:hedgerow", '"flowering shrub"', 'incategory:"Shrubs"'],
  },
  birds: {
    wm: ["haswbstatement:P180=Q5113", '"Birds of America" Audubon',
         '"bird illustration"'],
    si: ['unit_code:"NMNHBIRDS"'],
  },
  mammals: {
    /* no intitle:beetle-style traps here, but note intitle:horse also
       catches horse racing — acceptable, they are still horses */
    wm: ["intitle:deer", "intitle:horse", "intitle:fox",
         "haswbstatement:P180=Q7377"],
    si: ['unit_code:"NMNHMAMMALS"'],
  },
  insects: {
    /* not intitle:beetle — half of those are Volkswagens */
    wm: ["intitle:butterfly", "intitle:moth", 'incategory:"Insects"'],
    si: ['unit_code:"NMNHENTO"'],
  },
  marine: {
    wm: ["Haeckel Kunstformen", "intitle:coral", "intitle:conchology",
         "intitle:seashell"],
    si: ['unit_code:"NMNHFISHES"'],
  },
  creatures: {
    ia: ["subject:(zoology OR ornithology OR natural history)"],
    wm: ['"zoological illustration"', "taxidermy specimen", "intitle:skeleton"],
    well: ["zoological", "natural history"],
  },

  /* ---------- Photography ---------- */
  props: {
    met: [{ q: "still life", medium: "Paintings" }],
    cma: ["type=Painting&q=still%20life"],
    wm: ['intitle:"still life"'],
    ia: ['subject:("still life")'],
  },
  costume: {
    wm: ['"theatrical costume"'],
    loc: [`${LOC_CAT} intitle:costume`],
    met: [{ q: "costume", medium: "Costume" }],
    ia: ['subject:("theatrical costume" OR "costume design" OR "stage costume")'],
    va: ["costume", "theatre costume"],
  },
  lighting: {
    wm: ["chiaroscuro", "nocturne painting", "candlelight painting", "intitle:silhouette"],
    met: [{ q: "night", medium: "Paintings" }],
    cma: ["type=Painting&q=night"],
    loc: [`${LOC_CAT} intitle:night`],
  },
  atmosphere: {
    wm: ['incategory:"Fog"', "intitle:mist", "storm clouds", "intitle:dusk"],
    cma: ["type=Painting&q=storm"],
    met: [{ q: "storm", medium: "Paintings" }],
  },
  biome: {
    wm: ["intitle:dunes", "rainforest", "intitle:glacier", '"salt marsh"'],
    ia: ["subject:(deserts OR glaciers)"],
  },
  street: {
    loc: [`${LOC_CAT} "Farm Security Administration"`,
          `${LOC_CAT} Bain News Service`,
          `${LOC_CAT} intitle:street`],
    wm: ['"street photography"'],
  },
  earlycolor: {
    wm: ["autochrome", "photochrom"],
    loc: [`${LOC_CAT} photochrom`],
  },
  photoportraits: {
    wm: ['"carte de visite"', "daguerreotype portrait", '"studio portrait"'],
    loc: [`${LOC_CAT} intitle:portrait`],
    si: ['unit_code:"NPG" AND topic:"Portraits"'],
  },

  /* ---------- Design ---------- */
  typography: {
    ia: ['subject:("type specimens" OR typography OR lettering OR calligraphy)'],
    /* Commons homonyms to avoid: "type specimen" means a holotype in
       biology, and intitle:lettering is mostly ship-hull name photos */
    wm: ["intitle:typeface", 'incategory:"Alphabets"', "intitle:alphabet",
         "intitle:calligraphy", 'intitle:"specimen book"'],
  },
  posters: {
    loc: [`${LOC_CAT} intitle:poster`],
    wm: ["intitle:poster"],
    met: [{ q: "poster", medium: "Prints" }],
    va: ["poster"],
    europeana: ["what:poster"],
  },
  brand: {
    wm: ["intitle:trademark", "intitle:monogram", 'intitle:"ex libris"'],
  },
  editorial: {
    wm: ['intitle:"title page"', '"magazine cover"', "intitle:broadside"],
  },
  abstract: {
    wm: ["intitle:abstract", "intitle:kaleidoscope"],
    cma: ["q=abstract"],
  },
  /* Geometry lives on Commons (renders, diagrams, photographed models) and
     Sketchfab model-search thumbnails. IA's geometry subjects tested junk-thin
     (1–12 usable items), so it sits these out. 'stellated' is Commons-only —
     on Sketchfab it matches stellate neurons. */
  polyhedra: {
    wm: ['incategory:"Polyhedra"', "intitle:polyhedron", "stellated",
         "intitle:icosahedron", "intitle:dodecahedron", '"Kepler-Poinsot"',
         "intitle:hypercube", '"geodesic dome"'],
    sf: ["polyhedron", "icosahedron", "dodecahedron"],
  },
  curves: {
    wm: ['"Klein bottle"', '"Möbius strip"', '"minimal surface"',
         '"torus knot"', "Lissajous", "Chladni", '"Penrose tiling"',
         '"mathematical model"', "intitle:fractal", '"Mandelbrot set"'],
    sf: ["klein bottle", "gyroid", "mobius strip", "torus knot"],
  },
  ornament: {
    ia: ["subject:(ornament OR pattern OR wallpaper OR textile)"],
    wm: ["intitle:ornament"],
    met: [{ q: "design", medium: "Textiles" }],
    cma: ["type=Textile"],
    va: ["ornament", "wallpaper", "textile"],
    si: ['unit_code:"CHNDM" AND (object_type:"Wallcoverings" OR object_type:"Textiles")'],
    europeana: ["ornament"],
  },
  maps: {
    ia: ["subject:(map OR maps OR cartography)"],
    wm: ["intitle:map"],
    loc: [`${LOC_CAT} intitle:map`],
    europeana: ["what:map"],
  },
  charts: {
    ia: ['subject:(infographics OR diagrams OR "statistical atlas" OR chart)'],
    wm: ["intitle:diagram", '"statistical atlas"'],
    europeana: ["what:diagram"],
  },

  /* ---------- Archive ---------- */
  paintings: {
    met: [{ q: "painting", medium: "Paintings" }],
    cma: ["type=Painting"],
    wm: ['"oil painting"'],
    ia: ["subject:(painting OR paintings OR watercolor)"],
    europeana: ["what:painting"],
  },
  photos: {
    met: [{ q: "photograph", medium: "Photographs" }],
    cma: ["type=Photograph"],
    wm: ['"vintage photograph"'],
    loc: [LOC_CAT],
    ia: ["subject:(photograph OR photographs OR photography)"],
    europeana: ["what:photograph"],
  },
  portraits: {
    met: [{ q: "portrait", medium: "Paintings" }],
    cma: ["type=Painting&q=portrait"],
    si: ['unit_code:"NPG" AND topic:"Portraits"'],
    /* haswbstatement is Commons' structured "depicts" tag (Wikidata
       Q134307 = portrait) — machine-readable, unlike title text */
    wm: ['incategory:"Portrait paintings"', "haswbstatement:P180=Q134307",
         "intitle:portrait"],
    loc: [`${LOC_CAT} intitle:portrait`],
    europeana: ["what:portrait"],
  },
  manuscripts: {
    ia: ["subject:(manuscript OR manuscripts OR illuminated)"],
    wm: ['"illuminated manuscript"'],
    cma: ["type=Manuscript"],
    europeana: ["what:manuscript"],
  },
  architecture: {
    ia: ["subject:(architecture)"],
    wm: ['"architectural drawing"'],
    loc: [`${LOC_CAT} intitle:building`],
    europeana: ["architecture"],
  },
  botanical: {
    ia: ['subject:(botany OR botanical OR "botanical illustration" OR flora)'],
    wm: ['incategory:"Botanical illustrations"', '"botanical illustration"',
         "haswbstatement:P180=Q506"],
    /* Wellcome's query= is full-text, so it only earns a place in the
       categories its collection is actually about: herbals, not gardens */
    well: ["herbal"],
    si: ['unit_code:"NMNHBOTANY"'],
    cma: ["q=botanical"],
    europeana: ['"botanical illustration"'],
  },
  objects: {
    met: [{ q: "sculpture", medium: "Sculpture" }],
    cma: ["type=Sculpture"],
    va: ["ceramics", "furniture", "metalwork"],
    si: ['unit_code:"CHNDM"'],
    gdh: [true],
    ia: ['subject:(sculpture OR ceramics OR artifact OR "decorative arts")'],
    europeana: ["what:sculpture"],
  },
};

/* Derived: which categories each provider can serve (drives "Anything"
   and the source-pin graying). */
const PROVIDER_CATS = {};
for (const [cat, byProvider] of Object.entries(RECIPES)) {
  for (const pid of Object.keys(byProvider)) {
    (PROVIDER_CATS[pid] = PROVIDER_CATS[pid] || []).push(cat);
  }
}
