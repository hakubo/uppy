---
'@uppy/companion': patch
---

URL imports no longer send `Accept: application/json` when downloading the file, so hosts that answer that header with 406 now serve it. `/url/meta` now reports a remote server's refusal the way `/url/get` does: a 500 whose body carries the remote `statusCode`, instead of `{ message: 'failed to fetch URL metadata' }`.
