import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeToken, isExpired } from '../src/core/token.js'

/**
 * Makes an unsigned token with the given payload. Only the payload is read.
 * @param {Object} payload
 * @returns {string}
 */
function makeToken(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(payload)}.signature`
}

test('decodeToken reads the subject and the username', () => {
  const payload = decodeToken(makeToken({ sub: '65f0', username: 'oliver', exp: 1 }))

  assert.equal(payload.sub, '65f0')
  assert.equal(payload.username, 'oliver')
})

test('decodeToken reads the base64url characters - and _', () => {
  // These values give + and / in base64, which base64url writes as - and _.
  for (const [value, expected] of [
    ['???', '_'],
    ['>>>', '-'],
  ]) {
    const token = makeToken({ sub: 'abc', u: value })

    assert.ok(token.split('.')[1].includes(expected), `the token should contain ${expected}`)
    assert.equal(decodeToken(token).u, value)
  }
})

test('decodeToken reads UTF-8 in the username', () => {
  const payload = decodeToken(makeToken({ sub: 'abc', username: 'åäö €' }))

  assert.equal(payload.username, 'åäö €')
})

test('decodeToken returns null for anything that is not a token with a subject', () => {
  for (const token of [
    'nope',
    'a.b',
    'a.!!!.c',
    `a.${Buffer.from('{}').toString('base64url')}.c`,
    '',
    undefined,
    null,
    42,
  ]) {
    assert.equal(decodeToken(token), null, String(token))
  }
})

test('isExpired compares the expiry time (in seconds) with the current time', () => {
  const now = Date.UTC(2026, 9, 14, 12, 0, 0)
  const nowSeconds = now / 1000

  assert.equal(isExpired({ exp: nowSeconds + 60 }, now), false)
  assert.equal(isExpired({ exp: nowSeconds }, now), true)
  assert.equal(isExpired({ exp: nowSeconds - 60 }, now), true)
})

test('isExpired treats a token without an expiry time as expired', () => {
  assert.equal(isExpired({ sub: 'abc' }), true)
  assert.equal(isExpired({ exp: '9999999999' }), true)
})
