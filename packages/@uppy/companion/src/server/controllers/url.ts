import type { Request, Response } from 'express'
import express from 'express'
import { downloadURL } from '../download.js'
import { getURLMeta, validateURL } from '../helpers/request.js'
import { isRecord } from '../helpers/type-guards.js'
import { startDownUpload } from '../helpers/upload.js'
import logger from '../logger.js'
import { respondWithError } from '../provider/error.js'
import { userError } from '../provider/errorCodes.js'

// Connection errors that mean the URL's server can't be reached (no such host,
// nothing listening, no route): the user can fix them, unlike a failure here.
const CANNOT_CONNECT_CODES = new Set([
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
])

/** A connection error as the user-facing `URL_CANNOT_CONNECT`; others as they are. */
function toUserError(err: unknown): unknown {
  const code = isRecord(err) ? err['code'] : undefined
  return typeof code === 'string' && CANNOT_CONNECT_CODES.has(code)
    ? userError(
        'URL_CANNOT_CONNECT',
        'Cannot connect to the server hosting this file',
      )
    : err
}

/**
 * Fetch the size and content type of a URL.
 */
const meta = async (req: Request, res: Response): Promise<void> => {
  try {
    logger.debug('URL file import handler running', undefined, req.id)
    const { allowLocalUrls } = req.companion.options
    if (!validateURL(req.body.url, allowLocalUrls)) {
      logger.debug(
        'Invalid request body detected. Exiting url meta handler.',
        undefined,
        req.id,
      )
      res.status(400).json({ error: 'Invalid request body' })
      return
    }

    const urlMeta = await getURLMeta(req.body.url, allowLocalUrls)
    res.json(urlMeta)
  } catch (err) {
    logger.error(err, 'controller.url.meta.error', req.id)
    if (respondWithError(toUserError(err), res)) return
    res.status(500).json({ message: 'failed to fetch URL metadata' })
  }
}

/**
 * Import a file from a remote URL, then upload it to the specified destination.
 */
const get = async (req: Request, res: Response): Promise<void> => {
  logger.debug('URL file import handler running', undefined, req.id)
  const { allowLocalUrls } = req.companion.options
  if (!validateURL(req.body.url, allowLocalUrls)) {
    logger.debug(
      'Invalid request body detected. Exiting url import handler.',
      undefined,
      req.id,
    )
    res.status(400).json({ error: 'Invalid request body' })
    return
  }

  const download = () => downloadURL(req.body.url, allowLocalUrls, req.id)

  try {
    await startDownUpload({ req, res, download, getSize: undefined })
  } catch (err) {
    logger.error(err, 'controller.url.error', req.id)
    if (respondWithError(toUserError(err), res)) return
    res.status(500).json({ message: 'failed to fetch URL' })
  }
}

export default () =>
  express
    .Router()
    .post('/meta', express.json({ inflate: false }), meta)
    .post('/get', express.json({ inflate: false }), get)
