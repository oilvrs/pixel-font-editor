import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SIZES } from '../src/core/grid.js'
import { UPM, unitsPerPixel, getMetrics, defaultMargin } from '../src/metrics.js'

test('every guide lands on a whole row inside the grid', () => {
  for (const size of SIZES) {
    for (const row of Object.values(getMetrics(size))) {
      assert.ok(Number.isInteger(row))
      assert.ok(row >= 0 && row <= size)
    }
  }
})

test('guides are ordered from top to bottom', () => {
  for (const size of SIZES) {
    const m = getMetrics(size)
    assert.ok(m.ascender < m.capHeight)
    assert.ok(m.capHeight < m.xHeight)
    assert.ok(m.xHeight < m.baseline)
    assert.ok(m.baseline < m.descender)
  }
})

test('every size gives the same metrics in font units', () => {
  for (const size of SIZES) {
    const m = getMetrics(size)
    const units = (row) => (m.baseline - row) * unitsPerPixel(size)

    assert.equal(units(m.baseline), 0)
    assert.equal(units(m.capHeight), 1536)
    assert.equal(units(m.xHeight), 1024)
    assert.equal(units(m.ascender), 1792)
    assert.equal(units(m.descender), -256)
  }
})

test('units per pixel divide the UPM evenly', () => {
  for (const size of SIZES) {
    assert.ok(Number.isInteger(unitsPerPixel(size)))
    assert.equal(unitsPerPixel(size) * size, UPM)
  }
})

test('getMetrics rejects unsupported sizes', () => {
  assert.throws(() => getMetrics(24), RangeError)
})

test('the default margin is a whole number of pixels, about 128 font units', () => {
  for (const size of SIZES) assert.ok(Number.isInteger(defaultMargin(size)))
  assert.equal(defaultMargin(32), 2)
  assert.equal(defaultMargin(8), 1)
})
