import { test } from 'node:test'
import assert from 'node:assert/strict'
import zlib from 'node:zlib'
import { createZip } from '../src/core/zip.js'
import { readZip } from '../src/core/zip-read.js'

const inflate = async (raw) => new Uint8Array(zlib.inflateRawSync(raw))
const encode = (text) => new TextEncoder().encode(text)

/**
 * Writes a ZIP file where each entry can be stored or deflated. Checksums are left empty.
 * @param {Object[]} entries - [{ name, data, deflate }]
 * @returns {Uint8Array}
 */
function makeZip(entries) {
  const parts = []
  const central = []
  let offset = 0

  for (const { name, data, deflate } of entries) {
    const nameBytes = Buffer.from(name)
    const body = deflate ? zlib.deflateRawSync(data) : Buffer.from(data)
    const method = deflate ? 8 : 0

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    parts.push(local, nameBytes, body)

    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4)
    entry.writeUInt16LE(20, 6)
    entry.writeUInt16LE(method, 10)
    entry.writeUInt32LE(body.length, 20)
    entry.writeUInt32LE(data.length, 24)
    entry.writeUInt16LE(nameBytes.length, 28)
    entry.writeUInt32LE(offset, 42)
    central.push(entry, nameBytes)

    offset += 30 + nameBytes.length + body.length
  }

  const centralBytes = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBytes.length, 12)
  end.writeUInt32LE(offset, 16)

  return new Uint8Array(Buffer.concat([...parts, centralBytes, end]))
}

test('readZip reads stored and deflated entries', async () => {
  const big = new Uint8Array(2000).fill(7)
  const zip = makeZip([
    { name: 'a.txt', data: encode('hello') },
    { name: 'dir/b.bin', data: big, deflate: true },
  ])

  const entries = await readZip(zip, inflate)

  assert.deepEqual(
    entries.map((entry) => entry.name),
    ['a.txt', 'dir/b.bin']
  )
  assert.deepEqual(entries[0].data, encode('hello'))
  assert.deepEqual(entries[1].data, big)
})

test('readZip reads what createZip writes', async () => {
  const zip = createZip([
    { name: 'Font.ufo/metainfo.plist', data: '<plist/>' },
    { name: 'Font.ufo/glyphs/ö.glif', data: new Uint8Array([1, 2, 3]) },
  ])

  const entries = await readZip(new Uint8Array(zip), inflate)

  assert.deepEqual(entries.map((entry) => entry.name).sort(), [
    'Font.ufo/glyphs/ö.glif',
    'Font.ufo/metainfo.plist',
  ])
  assert.deepEqual(
    entries.find((entry) => entry.name.endsWith('.glif')).data,
    new Uint8Array([1, 2, 3])
  )
})

test('readZip leaves out folders and entries that are not wanted, without unpacking them', async () => {
  const zip = makeZip([
    { name: 'dir/', data: new Uint8Array(0) },
    { name: 'keep.txt', data: encode('keep') },
    { name: 'skip.bin', data: new Uint8Array(500).fill(1), deflate: true },
  ])

  let unpacked = 0
  const counting = async (raw) => {
    unpacked++
    return inflate(raw)
  }

  const entries = await readZip(zip, counting, (name) => name.endsWith('.txt'))

  assert.deepEqual(
    entries.map((entry) => entry.name),
    ['keep.txt']
  )
  assert.equal(unpacked, 0)
})

test('readZip rejects files that are not zip files', async () => {
  await assert.rejects(() => readZip(encode('this is not a zip file at all'), inflate), /not a zip/)
  await assert.rejects(() => readZip(new Uint8Array(0), inflate), /not a zip/)
})
