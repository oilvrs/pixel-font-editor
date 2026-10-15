import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRoute, resolveRoute, routeToHash } from '../src/core/route.js'

const ID = '0123456789abcdef01234567'

test('parseRoute reads the three routes', () => {
  assert.deepEqual(parseRoute('#/login'), { name: 'login' })
  assert.deepEqual(parseRoute('#/projects'), { name: 'projects' })
  assert.deepEqual(parseRoute(`#/p/${ID}`), { name: 'editor', projectId: ID })
})

test('parseRoute falls back to the project list', () => {
  for (const hash of [
    '',
    '#',
    '#/',
    '#/nope',
    '#/p/',
    '#/p',
    '#/p/not-an-id',
    `#/p/${ID}/extra`,
    `#/p/${ID}0`,
    '#/login/extra',
    undefined,
    null,
  ]) {
    assert.deepEqual(parseRoute(hash), { name: 'projects' }, String(hash))
  }
})

test('parseRoute ignores a trailing slash and a query string', () => {
  assert.deepEqual(parseRoute('#/login/'), { name: 'login' })
  assert.deepEqual(parseRoute('#/login?x=1'), { name: 'login' })
  assert.deepEqual(parseRoute(`#/p/${ID}/`), { name: 'editor', projectId: ID })
})

test('routeToHash is the inverse of parseRoute', () => {
  for (const hash of ['#/login', '#/projects', `#/p/${ID}`]) {
    assert.equal(routeToHash(parseRoute(hash)), hash)
  }
})

test('resolveRoute sends everyone who is logged out to the login page', () => {
  for (const hash of ['', '#/projects', '#/login', `#/p/${ID}`]) {
    assert.deepEqual(resolveRoute(hash, false), { name: 'login' }, hash)
  }
})

test('resolveRoute keeps the route of someone who is logged in, except login', () => {
  assert.deepEqual(resolveRoute('#/projects', true), { name: 'projects' })
  assert.deepEqual(resolveRoute(`#/p/${ID}`, true), { name: 'editor', projectId: ID })
  assert.deepEqual(resolveRoute('#/login', true), { name: 'projects' })
  assert.deepEqual(resolveRoute('', true), { name: 'projects' })
})
