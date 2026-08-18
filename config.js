/* Optional API keys. The app works without them — these two sources just
   stay quiet until a key is pasted in.

   Europeana   → free key via https://pro.europeana.eu/page/get-api
   Smithsonian → free key via https://api.data.gov/signup            */

window.ARCHIVE_KEYS = {
  europeana: "",
  smithsonian: "VKh7F4wjfpGKwi3N5SFE8Qjcpo8W9uaevPhd6jm8",

  /* Smithsonian's search API works, but their image host (ids.si.edu)
     stopped serving cross-origin browser requests — bot defense that
     curl passes and browsers can't. The provider stays off until this is
     true; flip it to test whether they've relaxed it. */
  smithsonianImages: false,
};
