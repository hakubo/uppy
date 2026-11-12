---
'@uppy/companion': patch
'@uppy/core': patch
'@uppy/locales': patch
---

`/url/meta` and `/url/get` now answer a URL whose server can't be reached (no such host, connection refused, no route) with a 400 `{ code: 'URL_CANNOT_CONNECT', message }`, instead of a bare 500. `@uppy/core` maps the code to the new `urlCannotConnect` locale string.
