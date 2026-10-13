import { test } from 'node:test'
import assert from 'node:assert/strict'
import { glyphName, exportFileName } from '../src/core/glyph-names.js'

test('letters keep their own name', () => {
  assert.equal(glyphName('a'), 'a')
  assert.equal(glyphName('Z'), 'Z')
})

test('digits and punctuation use AGLFN names', () => {
  assert.equal(glyphName('0'), 'zero')
  assert.equal(glyphName('9'), 'nine')
  assert.equal(glyphName('.'), 'period')
  assert.equal(glyphName(' '), 'space')
  assert.equal(glyphName('-'), 'hyphen')
  assert.equal(glyphName('"'), 'quotedbl')
})

test('Swedish letters', () => {
  assert.equal(glyphName('å'), 'aring')
  assert.equal(glyphName('Ä'), 'Adieresis')
  assert.equal(glyphName('ö'), 'odieresis')
})

test('other characters fall back to uniXXXX', () => {
  assert.equal(glyphName('Ω'), 'uni03A9')
  assert.equal(glyphName('😀'), 'u1F600')
})

test('only the first character counts, and empty input gives no name', () => {
  assert.equal(glyphName('ab'), 'a')
  assert.equal(glyphName(''), '')
})

test('uppercase letters get an underscore in file names', () => {
  assert.equal(exportFileName('a', 'svg'), 'a.svg')
  assert.equal(exportFileName('A', 'svg'), 'A_.svg')
  assert.equal(exportFileName('Adieresis', 'svg'), 'A_dieresis.svg')
  assert.equal(exportFileName('AE', 'png'), 'A_E_.png')
  assert.equal(exportFileName('zero', 'svg'), 'zero.svg')
})
