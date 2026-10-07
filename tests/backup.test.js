import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGrid, setPixel, getPixel, serializeGrid } from '../src/core/grid.js'
import { createBackup, parseBackup } from '../src/core/backup.js'

function makeSets() {
  const a = createGrid(16)
  setPixel(a, 3, 4, 1)

  return new Map([[16, { margin: 1, name: 'Test', glyphs: new Map([['a', { grid: a }], ['b', { grid: createGrid(16) }]]) }]])
}

test('the backup keeps drawn glyphs and leaves empty ones out', () => {
  const backup = createBackup(makeSets(), 'hello')
  assert.deepEqual(Object.keys(backup.sets[16].glyphs), ['a'])
})

test('a backup survives a round trip through JSON', () => {
  const parsed = parseBackup(JSON.stringify(createBackup(makeSets(), 'hello')))

  assert.equal(parsed.text, 'hello')
  assert.equal(parsed.sets.length, 1)
  assert.equal(parsed.sets[0].size, 16)
  assert.equal(parsed.sets[0].margin, 1)
  assert.equal(parsed.sets[0].name, 'Test')
  assert.equal(parsed.sets[0].glyphs.length, 1)
  assert.equal(parsed.sets[0].glyphs[0].char, 'a')
  assert.equal(getPixel(parsed.sets[0].glyphs[0].grid, 3, 4), 1)
})

test('files that are not backups are rejected', () => {
  assert.throws(() => parseBackup('not json'), /not valid JSON/)
  assert.throws(() => parseBackup('{"a": 1}'), /not a backup/)
})

test('damaged glyphs, wrong sizes and unknown characters are skipped, and the margin is limited', () => {
  const valid = serializeGrid(createGrid(16))
  const json = JSON.stringify({
    format: 'pixel-glyph-editor-backup',
    version: 1,
    sets: {
      16: {
        margin: 99,
        glyphs: {
          a: { size: 32, bits: '' }, // Wrong size
          b: { size: 16, bits: '!!!' }, // Damaged
          c: valid, // Fine
          Ω: valid // Not part of the glyph set
        }
      }
    }
  })

  const parsed = parseBackup(json)

  assert.equal(parsed.sets[0].margin, 4)
  assert.deepEqual(parsed.sets[0].glyphs.map((g) => g.char), ['c'])
  assert.equal(parsed.sets[0].name, null)
})

test('spacing is kept in a backup', () => {
  const grid = createGrid(16)
  setPixel(grid, 1, 1, 1)

  const sets = new Map([[16, { margin: 1, name: 'Test', glyphs: new Map([['a', { grid, spacing: { left: 150, right: null } }]]) }]])
  const parsed = parseBackup(JSON.stringify(createBackup(sets)))

  assert.deepEqual(parsed.sets[0].glyphs[0].spacing, { left: 150, right: null })
})
