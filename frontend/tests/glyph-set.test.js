import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GLYPH_GROUPS, ALL_GLYPHS } from '../src/core/glyph-set.js'
import { glyphName, exportFileName } from '../src/core/glyph-names.js'

test('the set has 204 unique glyphs and no space', () => {
  assert.equal(ALL_GLYPHS.length, 204)
  assert.equal(new Set(ALL_GLYPHS).size, 204)
  assert.ok(!ALL_GLYPHS.includes(' '))
})

test('the groups add up to the whole set', () => {
  const total = GLYPH_GROUPS.reduce((sum, group) => sum + group.chars.length, 0)
  assert.equal(total, ALL_GLYPHS.length)
})

test('the Swedish letters have their own group and are not repeated', () => {
  const swedish = GLYPH_GROUPS.find((group) => group.id === 'swedish').chars
  const accented = GLYPH_GROUPS.find((group) => group.id === 'accented').chars

  assert.deepEqual(swedish, ['å', 'ä', 'ö', 'Å', 'Ä', 'Ö'])
  assert.ok(swedish.every((char) => !accented.includes(char)))
})

test('every glyph has an AGLFN name, never a uni fallback', () => {
  for (const char of ALL_GLYPHS) {
    assert.ok(!/^uni[0-9A-F]{4}$/.test(glyphName(char)), `${char} has no AGLFN name`)
  }
})

test('glyph names are unique', () => {
  const names = ALL_GLYPHS.map(glyphName)
  assert.equal(new Set(names).size, names.length)
})

test('file names are unique even on a case-insensitive file system', () => {
  const files = ALL_GLYPHS.map((char) => exportFileName(glyphName(char), 'svg').toLowerCase())
  assert.equal(new Set(files).size, files.length)
})
