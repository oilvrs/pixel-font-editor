/**
 * Helpers for writing binary font data (big-endian, as the sfnt format uses).
 * Pure logic, no DOM dependencies.
 *
 * @version 0.1.0
 */

export class Writer {
  constructor() {
    this.bytes = []
  }

  /**
   * @returns {number} the number of bytes written so far
   */
  get length() {
    return this.bytes.length
  }

  u8(value) {
    this.bytes.push(value & 0xff)
    return this
  }

  u16(value) {
    this.bytes.push((value >> 8) & 0xff, value & 0xff)
    return this
  }

  i16(value) {
    return this.u16(value & 0xffff)
  }

  u32(value) {
    this.bytes.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff)
    return this
  }

  i32(value) {
    return this.u32(value >>> 0)
  }

  /**
   * A 64-bit signed number, for dates. Values up to 2^53 are exact.
   */
  i64(value) {
    this.u32(Math.floor(value / 4294967296))
    return this.u32(value % 4294967296)
  }

  /**
   * A 4 character tag, written as ASCII.
   */
  tag(text) {
    for (let i = 0; i < 4; i++) this.u8(text.charCodeAt(i))
    return this
  }

  raw(bytes) {
    for (const byte of bytes) this.bytes.push(byte)
    return this
  }

  /**
   * Adds zero bytes until the length is a multiple of a number.
   */
  pad(multiple = 4) {
    while (this.bytes.length % multiple !== 0) this.bytes.push(0)
    return this
  }

  /**
   * @returns {Uint8Array}
   */
  toBytes() {
    return Uint8Array.from(this.bytes)
  }
}

/**
 * The checksum of a table: the sum of its 32-bit words, with the data padded
 * with zeros to a whole number of words.
 * @param {Uint8Array} bytes
 * @returns {number} unsigned 32-bit value
 */
export function checksum(bytes) {
  let sum = 0

  for (let i = 0; i < bytes.length; i += 4) {
    const word = ((bytes[i] << 24) | ((bytes[i + 1] || 0) << 16) | ((bytes[i + 2] || 0) << 8) | (bytes[i + 3] || 0)) >>> 0
    sum = (sum + word) >>> 0
  }

  return sum
}
