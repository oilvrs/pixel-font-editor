import { test } from 'node:test'
import assert from 'node:assert/strict'
import zlib from 'node:zlib'
import { createGrid, setPixel } from '../src/core/grid.js'
import { buildFont, assembleSfnt } from '../src/core/export-ttf.js'
import { buildWoff } from '../src/core/woff.js'
import { sumWords } from './font-reader.js'

function sampleFont() {
  const grid = createGrid(32)
  for (let y = 12; y < 28; y++) for (let x = 4; x < 16; x++) if (x === 4 || x === 15 || y === 12 || y === 27) setPixel(grid, x, y, 1)

  return buildFont([{ char: 'O', grid, shapes: [{ type: 'ellipse', cx: 24, cy: 22, w: 8, h: 8, angle: 0 }], spacing: null }], {
    familyName: 'Woff Test',
    size: 32,
    margin: 2,
    date: new Date('2026-10-08T12:00:00Z')
  })
}

const deflate = async (bytes) => zlib.deflateSync(bytes)

function readWoff(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint16(12)
  const tables = []

  for (let i = 0; i < count; i++) {
    const at = 44 + 20 * i
    tables.push({
      tag: String.fromCharCode(...bytes.subarray(at, at + 4)),
      offset: view.getUint32(at + 4),
      compLength: view.getUint32(at + 8),
      origLength: view.getUint32(at + 12),
      checksum: view.getUint32(at + 16)
    })
  }

  return { view, tables }
}

test('the header describes the file', async () => {
  const font = sampleFont()
  const woff = await buildWoff(font.tables, deflate)
  const { view, tables } = readWoff(woff)

  assert.equal(view.getUint32(0), 0x774f4646)
  assert.equal(view.getUint32(4), 0x00010000)
  assert.equal(view.getUint32(8), woff.length)
  assert.equal(view.getUint16(12), font.tables.length)
  assert.equal(view.getUint16(14), 0)
  assert.equal(view.getUint32(16), font.ttf.length) // The size of the font when it is unpacked
  assert.equal(tables.length, font.tables.length)
  assert.equal(woff.length % 4, 0)
})

test('tables are in tag order, on word boundaries, and do not overlap', async () => {
  const woff = await buildWoff(sampleFont().tables, deflate)
  const { tables } = readWoff(woff)

  assert.deepEqual(tables.map((t) => t.tag), [...tables.map((t) => t.tag)].sort())

  let expected = 44 + 20 * tables.length
  for (const t of tables) {
    assert.equal(t.offset, expected)
    assert.equal(t.offset % 4, 0)
    expected += Math.ceil(t.compLength / 4) * 4
  }
  assert.equal(expected, woff.length)
})

test('every table unpacks to the original data', async () => {
  const font = sampleFont()
  const woff = await buildWoff(font.tables, deflate)

  for (const entry of readWoff(woff).tables) {
    const original = font.tables.find((t) => t.tag === entry.tag)
    const stored = woff.subarray(entry.offset, entry.offset + entry.compLength)
    const data = entry.compLength < entry.origLength ? new Uint8Array(zlib.inflateSync(stored)) : stored

    assert.equal(entry.origLength, original.data.length, entry.tag)
    assert.deepEqual(new Uint8Array(data), original.data, entry.tag)
    assert.equal(entry.checksum, original.checksum, entry.tag)
  }
})

test('a table is only compressed when that makes it smaller', async () => {
  const woff = await buildWoff(sampleFont().tables, deflate)
  for (const t of readWoff(woff).tables) assert.ok(t.compLength <= t.origLength, t.tag)
})

test('without compression the tables are stored as they are', async () => {
  const font = sampleFont()
  const woff = await buildWoff(font.tables, null)

  for (const t of readWoff(woff).tables) assert.equal(t.compLength, t.origLength)
  assert.equal(new DataView(woff.buffer).getUint32(16), font.ttf.length)
})

test('a compressor that gives up (null) leaves that table stored', async () => {
  const woff = await buildWoff(sampleFont().tables, async () => null)
  for (const t of readWoff(woff).tables) assert.equal(t.compLength, t.origLength)
})

test('the unpacked tables make the same font as the TTF', async () => {
  const font = sampleFont()
  const woff = await buildWoff(font.tables, deflate)

  const tables = readWoff(woff).tables.map((entry) => {
    const stored = woff.subarray(entry.offset, entry.offset + entry.compLength)
    const data = new Uint8Array(entry.compLength < entry.origLength ? zlib.inflateSync(stored) : stored)

    if (entry.tag === 'head') data.fill(0, 8, 12) // The checksum adjustment is calculated again
    return { tag: entry.tag, data }
  })

  assert.deepEqual(assembleSfnt(tables).bytes, font.ttf)
  assert.equal(sumWords(font.ttf), 0xb1b0afba)
})
