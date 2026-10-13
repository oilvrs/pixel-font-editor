/**
 * Test environment. Runs before every test file.
 * Generates a fresh RSA key pair so that no secrets are needed locally or in CI.
 */

import { generateKeyPairSync } from 'node:crypto'

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
})

process.env.NODE_ENV = 'test'
process.env.ACCESS_TOKEN_SECRET = privateKey
process.env.ACCESS_TOKEN_PUBLIC = publicKey
process.env.ACCESS_TOKEN_LIFE = '1h'
process.env.CORS_ORIGIN = 'http://localhost:3003'
