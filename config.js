/* Optional API keys. The app works without them — these two sources just
   stay quiet until a key is pasted in.

   Europeana   → free key via https://pro.europeana.eu/page/get-api
   Smithsonian → free key via https://api.data.gov/signup            */

window.ARCHIVE_KEYS = {
  europeana: "",
  smithsonian: "VKh7F4wjfpGKwi3N5SFE8Qjcpo8W9uaevPhd6jm8",

  /* Modern cinema frames — free key from
     https://www.themoviedb.org/settings/api (sign up, request an API key,
     paste the v3 key here). Unlike every other source, TMDB's images are
     studio copyright, shown under TMDB's API terms; the attribution in
     the about panel is part of those terms, so leave it in place. */
  tmdb: "",

  /* Smithsonian's search API works, but their image host (ids.si.edu)
     stopped serving cross-origin browser requests — bot defense that
     curl passes and browsers can't. The provider stays off until this is
     true; flip it to test whether they've relaxed it. */
  smithsonianImages: false,
};
