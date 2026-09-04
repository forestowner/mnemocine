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

/* Curated Commons categories come first in props and decor: category
   membership is human-checked, so it avoids what bare title matching
   cannot — "Urania's Mirror" is a star chart, "Long Curtain" is a
   fortification wall, "Blind Husbands" is a 1919 film. The title queries
   stay for reach, since a curated category holds only a few hundred
   files.

   Props and decor want photographs of objects, not paintings of them —
   a bare noun like intitle:violin otherwise fills up with Old Master
   violin players. */
const NO_ART =
  ' -intitle:painting -intitle:portrait -intitle:drawing -intitle:engraving' +
  ' -intitle:print -intitle:sketch';

/* Keeps promotional artwork out of the cinema categories — the request is
   for frames and set photography, not posters. */
const NO_PROMO =
  ' -intitle:poster -intitle:"lobby card" -intitle:magazine -intitle:advertisement';

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
      { id: "props", label: "Props & objects" },
      { id: "decor", label: "Decor & set dressing" },
      { id: "costume", label: "Costume & wardrobe" },
      { id: "styling", label: "Contemporary styling", modern: true },
      { id: "posing", label: "Posing & movement", modern: true },
      { id: "lighting", label: "Lighting" },
      { id: "atmosphere", label: "Atmosphere & weather", modern: true },
      { id: "biome", label: "Biome & wilderness", modern: true },
      { id: "street", label: "Documentary & street" },
      { id: "earlycolor", label: "Early color & photochrom" },
      { id: "photoportraits", label: "Portrait photography" },
    ],
  },
  {
    label: "Cinematography",
    cats: [
      { id: "modern", label: "Modern cinema", modern: true },
      { id: "cinema", label: "Public domain cinema" },
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
  /* Art-school figure study. Living bodies a photographer can direct
     from live in Posing & movement, under Photography — mixing the two
     buried the dancers under académie drawings. */
  poses: {
    ia: ['subject:("figure drawing" OR "human figure" OR "life drawing")'],
    wm: ['intitle:"figure study"', 'Muybridge locomotion', '"nude study"',
         'académie nude'],
    cma: ["type=Drawing&q=figure", "type=Drawing&q=nude"],
  },
  anatomy: {
    ia: ['subject:(anatomy OR osteology OR "human anatomy")'],
    wm: ['"anatomical illustration"', "écorché", "intitle:anatomy"],
    well: ["anatomy", "skeleton", "dissection"],
  },
  /* Deliberately narrower than Costume & wardrobe, which used to overlap
     it almost entirely. This one is cloth as form — how fabric falls,
     folds and is cut. Costume is dress as worn, on a character. */
  drapery: {
    ia: ['subject:("fashion plates" OR drapery)'],
    wm: ["intitle:drapery", '"drapery study"', '"fashion plate"'],
    va: ["embroidery", "lace"],
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
  /* Objects you could actually put in front of a camera, not still-life
     paintings — those live under Paintings. The noun list comes from The
     Sims' buy-mode object taxonomy, which is a purpose-built catalogue of
     household things, filtered to real-world items and checked for volume
     on Commons. Rejected on inspection: "vinyl record" and "hand mirror"
     (too thin to sustain a pool), and vase, teapot, perfume bottle and
     pocket watch (Louvre and Sevres museum pieces dominate them — real
     objects, but not ones you could source for a shoot). */
  props: {
    wm: [
         'incategory:"Umbrellas"',
         'incategory:"Dolls"',
         'incategory:"Globes"',
         'incategory:"Candles"',
         'incategory:"Boots"',
         'incategory:"Teddy bears"',
         'incategory:"Lanterns"',
         `intitle:boots${NO_ART}`,
         `intitle:sneakers${NO_ART}`,
         `intitle:sunglasses${NO_ART}`,
         `intitle:goggles${NO_ART}`,
         `intitle:handbag${NO_ART}`,
         `intitle:umbrella${NO_ART}`,
         `intitle:suitcase${NO_ART}`,
         `intitle:teacup${NO_ART}`,
         `intitle:candle${NO_ART}`,
         `intitle:"playing cards"${NO_ART}`,
         `intitle:typewriter${NO_ART}`,
         `intitle:bouquet${NO_ART}`,
         `intitle:guitar${NO_ART}`,
         `intitle:"music box"${NO_ART}`,
         `intitle:"model train"${NO_ART}`,
         `intitle:balloon${NO_ART}`,
         `intitle:skateboard${NO_ART}`,
         `intitle:gramophone${NO_ART}`,
         `intitle:"sewing machine"${NO_ART}`,
         `intitle:binoculars${NO_ART}`,
         `intitle:scissors${NO_ART}`,
         `intitle:doll${NO_ART}`,
         `intitle:"teddy bear"${NO_ART}`,
         `intitle:globe${NO_ART}`,
         `intitle:"crystal ball"${NO_ART}`,
         `intitle:lantern${NO_ART}`,
         `intitle:trophy${NO_ART}`,
         `intitle:"trash can"${NO_ART}`,
   ],
  },
  /* Set dressing rather than handheld props — the split follows the Sims
     buy-mode catalogue, which separates portable objects from the things
     that furnish a room. Nouns are that catalogue's own subcategory names
     (Décor > Mirrors, Rugs, Curtains, Sculptures; Lighting; Surfaces),
     which are generic enough to search, unlike the game's item names.
     Scope is the Sims' Buy Mode, whole: appliances, comfort, surfaces,
     storage, lighting, electronics, kids, vehicles — a bicycle, a bed or
     a trash can is as good a prop as a candlestick. Build Mode is
     excluded, which is why fireplaces, staircases and fountains came back
     out: those are architecture, not things you place.

     Dropped as too thin on Commons: table lamp (154), floor lamp (50),
     end table (24), loveseat (18), potted plant (178), garden gnome (42),
     wind chimes (39), pinball machine (75). */
  decor: {
    wm: [
         'incategory:"Mirrors"',
         'incategory:"Rugs"',
         'incategory:"Curtains"',
         'incategory:"Chandeliers"',
         'incategory:"Aquariums"',
         `intitle:mirror${NO_ART}`,
         `intitle:rug${NO_ART}`,
         `intitle:curtain${NO_ART}`,
         `intitle:chandelier${NO_ART}`,
         `intitle:sculpture${NO_ART}`,
         `intitle:statue${NO_ART}`,
         `intitle:"picture frame"${NO_ART}`,
         `intitle:terrarium${NO_ART}`,
         `intitle:aquarium${NO_ART}`,
         `intitle:birdcage${NO_ART}`,
         `intitle:"christmas tree"${NO_ART}`,
         `intitle:pumpkin${NO_ART}`,
         `intitle:flamingo${NO_ART}`,
         `intitle:scarecrow${NO_ART}`,
         `intitle:snowman${NO_ART}`,
         `intitle:carousel${NO_ART}`,
         `intitle:telescope${NO_ART}`,
         `intitle:tent${NO_ART}`,
         `intitle:incense${NO_ART}`,
         `intitle:bed${NO_ART}`,
         `intitle:sofa${NO_ART}`,
         `intitle:armchair${NO_ART}`,
         `intitle:stool${NO_ART}`,
         `intitle:crib${NO_ART}`,
         `intitle:"coffee table"${NO_ART}`,
         `intitle:desk${NO_ART}`,
         `intitle:cabinet${NO_ART}`,
         `intitle:wardrobe${NO_ART}`,
         `intitle:refrigerator${NO_ART}`,
         `intitle:stove${NO_ART}`,
         `intitle:"washing machine"${NO_ART}`,
         `intitle:"vacuum cleaner"${NO_ART}`,
         `intitle:bathtub${NO_ART}`,
         `intitle:television${NO_ART}`,
         `intitle:telephone${NO_ART}`,
         `intitle:piano${NO_ART}`,
         `intitle:easel${NO_ART}`,
         `intitle:car${NO_ART}`,
         `intitle:bicycle${NO_ART}`,
         `intitle:"wall clock"${NO_ART}`,
   ],
  },

  /* Real bodies mid-movement, which is what you can actually direct a
     model into — dancers, gymnasts, martial artists, athletes at full
     extension. Rejected after sampling: intitle:sprinter (Toyota
     Sprinter), intitle:acrobat (Adobe Acrobat), intitle:ballet (opera
     houses) and intitle:"yoga pose" (30 files). */
  posing: {
    wm: ['incategory:"Dancers"', '"contemporary dance"', 'intitle:gymnast',
         'intitle:"long jump"', 'intitle:"martial arts"', 'intitle:"figure skating"',
         'intitle:breakdance'],
    ia: ['subject:(dance OR dancers OR gymnastics)'],
  },

  /* Present-day clothing as worn on real people — for scouting, renting
     or assembling a look, rather than the historical and theatrical
     material under Costume & wardrobe. Runway photography carries this:
     Commons has thousands of fashion-week images. */
  styling: {
    wm: ['"fashion week"', '"street fashion"', 'incategory:"Street fashion"',
         'incategory:"Fashion photography"'],
  },

  /* dress as worn — stage, character, period. See the note on drapery. */
  costume: {
    wm: ['"theatrical costume"', '"costume design"'],
    loc: [`${LOC_CAT} intitle:costume`],
    met: [{ q: "costume", medium: "Costume" }],
    ia: ['subject:("theatrical costume" OR "stage costume")'],
    va: ["theatre costume", "costume"],
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
  /* ---------- Cinematography ----------
     Modern film frames come from TMDB, whose backdrops are stills from
     the films themselves — the reason this category exists, since
     contemporary colour grading and lighting are what the public-domain
     record can't show. TMDB needs a free key; without one the provider
     stays dormant and only Public domain cinema answers here.

     Variants aim at different looks rather than different decades: the
     genre filters are a blunt but effective way to vary palette. */
  modern: {
    tmdb: [
      "sort_by=vote_count.desc&vote_count.gte=800",
      "sort_by=vote_average.desc&vote_count.gte=2000&with_genres=878", // sci-fi
      "sort_by=vote_average.desc&vote_count.gte=1000&with_genres=18",  // drama
      "sort_by=vote_count.desc&vote_count.gte=500&with_genres=80",     // crime
      "sort_by=vote_count.desc&vote_count.gte=500&with_genres=16",     // animation
      "sort_by=vote_count.desc&vote_count.gte=400&primary_release_date.gte=2015-01-01",
    ],
  },

  /* Public-domain film: pre-1929, US films whose copyright lapsed for
     non-renewal, and material published without notice. Silent era
     through mid-century — not monochrome only, since lobby cards were
     colour-printed and many frames were hand-tinted. */
  cinema: {
    /* Frames and scene stills only. Every query is a phrase naming a film,
       which is what keeps out the two things that kept leaking in: film as
       photographic stock ("family films", reels) and promotional artwork.
       NO_PROMO drops the rest of the latter.

       Rejected after sampling: "publicity still" and "movie still" (star
       headshots), "on the set of" and "during the filming of" (postcards
       and unrelated snapshots), lobby cards (often poster artwork rather
       than a photographed scene), and the Library of Congress film
       holdings entirely — those are cinema exteriors and film-exchange
       offices, not scenes. */
    wm: [
      `"still from the film"${NO_PROMO}`,
      `"scene from the film"${NO_PROMO}`,
      `"production still"${NO_PROMO}`,
      `"film still"${NO_PROMO}`,
      `intitle:screenshot film${NO_PROMO}`,
    ],
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
