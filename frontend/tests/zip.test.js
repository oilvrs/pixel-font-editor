import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crc32, createZip } from '../src/core/zip.js'

/**
 * Reads a ZIP made by createZip back into entries, following the central
 * directory and the local headers.
 */
function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = bytes.length - 22

  assert.equal(view.getUint32(end, true), 0x06054b50)

  const count = view.getUint16(end + 10, true)
  let p = view.getUint32(end + 16, true)
  const entries = []

  for (let i = 0; i < count; i++) {
    assert.equal(view.getUint32(p, true), 0x02014b50)

    const method = view.getUint16(p + 10, true)
    const crc = view.getUint32(p + 16, true)
    const size = view.getUint32(p + 24, true)
    const nameLength = view.getUint16(p + 28, true)
    const offset = view.getUint32(p + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLength))

    assert.equal(view.getUint32(offset, true), 0x04034b50)

    const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true)
    entries.push({ name, method, crc, size, data: bytes.subarray(start, start + size) })

    p += 46 + nameLength
  }

  return entries
}

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926)
  assert.equal(crc32(new Uint8Array(0)), 0)
})

test('files survive a round trip, including folders and UTF-8 names', () => {
  const binary = new Uint8Array([0, 1, 2, 255, 254])
  const zip = createZip([
    { name: 'Font.ufo/metainfo.plist', data: '<plist/>' },
    { name: 'å.txt', data: 'hej' },
    { name: 'data.bin', data: binary }
  ])

  const entries = readZip(zip)

  assert.deepEqual(entries.map((e) => e.name), ['Font.ufo/metainfo.plist', 'å.txt', 'data.bin'])
  assert.ok(entries.every((e) => e.method === 0))
  assert.equal(new TextDecoder().decode(entries[0].data), '<plist/>')
  assert.equal(new TextDecoder().decode(entries[1].data), 'hej')
  assert.deepEqual(new Uint8Array(entries[2].data), binary)
  assert.ok(entries.every((e) => e.crc === crc32(e.data) && e.size === e.data.length))
})

test('an empty ZIP is just the end record', () => {
  const zip = createZip([])
  assert.equal(zip.length, 22)
  assert.deepEqual(readZip(zip), [])
})
