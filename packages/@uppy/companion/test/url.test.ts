import http from 'node:http'
import type { AddressInfo } from 'node:net'
import nock from 'nock'
import request from 'supertest'
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest'

import { getServer } from './mockserver.js'

const { getURLMeta } = vi.hoisted(() => ({ getURLMeta: vi.fn() }))

vi.mock('express-prom-bundle')
vi.mock('tus-js-client')
vi.mock('../dist/server/helpers/request.js', async () => {
  return {
    ...(await vi.importActual('../dist/server/helpers/request.js')),
    getURLMeta,
  }
})

const cannotConnect = {
  code: 'URL_CANNOT_CONNECT',
  message: 'Cannot connect to the server hosting this file',
}

beforeEach(() => {
  getURLMeta.mockResolvedValue({ size: 7580, type: 'image/jpg' })
})

const getMockServer = async () =>
  getServer({ COMPANION_CLIENT_SOCKET_CONNECT_TIMEOUT: '0' })

const nockUrl = () =>
  nock('http://url.myendpoint.com')
    .get('/files')
    .reply(200, () => '')

afterEach(() => {
  nock.cleanAll()
})
afterAll(() => {
  nock.restore()
})

const invalids = [
  // no url at all or unsupported protocol
  null,
  '',
  'ftp://url.myendpoint.com/files',
]

describe('url meta', () => {
  test("return a url's meta data", async () => {
    const res = await request(await getMockServer())
      .post('/url/meta')
      .set('Content-Type', 'application/json')
      .send({
        url: 'http://url.myendpoint.com/files',
      })
      .expect(200)

    expect(res.body.size).toBe(7580)
    expect(res.body.type).toBe('image/jpg')
  })

  test.each(invalids)('return 400 for invalid url', async (urlCase) => {
    nockUrl()

    const res = await request(await getMockServer())
      .post('/url/meta')
      .set('Content-Type', 'application/json')
      .send({
        url: urlCase,
      })
      .expect(400)

    expect(res.body.error).toBe('Invalid request body')
  })

  test('reports a server it cannot reach as URL_CANNOT_CONNECT', async () => {
    getURLMeta.mockRejectedValue(
      Object.assign(new Error('getaddrinfo ENOTFOUND url.myendpoint.com'), {
        code: 'ENOTFOUND',
      }),
    )

    const res = await request(await getMockServer())
      .post('/url/meta')
      .set('Content-Type', 'application/json')
      .send({ url: 'http://url.myendpoint.com/files' })
      .expect(400)

    expect(res.body).toEqual(cannotConnect)
  })
})

describe('url get', () => {
  test('url download gets instanitated', async () => {
    nockUrl()

    const res = await request(await getMockServer())
      .post('/url/get')
      .set('Content-Type', 'application/json')
      .send({
        url: 'http://url.myendpoint.com/files',
        endpoint: 'http://tusd.tusdemo.net/files',
        protocol: 'tus',
      })
      .expect(200)

    expect(res.body.token).toBeTruthy()
  })

  test.each(
    invalids,
  )('downloads are not instantiated for invalid urls', async (urlCase) => {
    nockUrl()

    const res = await request(await getMockServer())
      .post('/url/get')
      .set('Content-Type', 'application/json')
      .send({
        url: urlCase,
        endpoint: 'http://tusd.tusdemo.net/files',
        protocol: 'tus',
      })
      .expect(400)

    expect(res.body.error).toBe('Invalid request body')
  })

  // Real sockets: nock's replyWithError never reaches got's stream.
  const getFile = async (url: string) =>
    request(
      await getServer({
        COMPANION_CLIENT_SOCKET_CONNECT_TIMEOUT: '0',
        COMPANION_ALLOW_LOCAL_URLS: 'true',
      }),
    )
      .post('/url/get')
      .set('Content-Type', 'application/json')
      .send({ url, endpoint: 'http://tusd.tusdemo.net/files', protocol: 'tus' })

  test('reports a server it cannot reach as URL_CANNOT_CONNECT', async () => {
    // Nothing listens on a port a closed server just released.
    const server = http.createServer()
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    await new Promise((resolve) => server.close(resolve))

    const res = await getFile(`http://127.0.0.1:${port}/files`)

    expect(res.status).toBe(400)
    expect(res.body).toEqual(cannotConnect)
  })

  test('answers other download errors with a 500', async () => {
    const server = http.createServer((req) => req.socket.destroy())
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    try {
      const res = await getFile(`http://127.0.0.1:${port}/files`)

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ message: 'failed to fetch URL' })
    } finally {
      server.close()
    }
  })
})
