import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextTheme, resolveTheme } from '../src/core/theme.js'

test('resolveTheme uses a saved choice before the system setting', () => {
  assert.equal(resolveTheme('light', true), 'light')
  assert.equal(resolveTheme('dark', false), 'dark')
})

test('resolveTheme follows the system when nothing valid is saved', () => {
  for (const stored of [null, undefined, '', 'blue', 'DARK']) {
    assert.equal(resolveTheme(stored, true), 'dark', String(stored))
    assert.equal(resolveTheme(stored, false), 'light', String(stored))
  }
})

test('nextTheme switches between the two themes', () => {
  assert.equal(nextTheme('light'), 'dark')
  assert.equal(nextTheme('dark'), 'light')
})
