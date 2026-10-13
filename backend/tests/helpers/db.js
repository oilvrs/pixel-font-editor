/**
 * Helpers for an in-memory MongoDB. A replica set is used because step 2
 * needs transactions.
 */

import mongoose from 'mongoose'
import { MongoMemoryReplSet } from 'mongodb-memory-server'

let replSet

/**
 * Starts the in-memory database and connects Mongoose to it.
 * Uses the same Mongoose settings as config/mongoose.js.
 *
 * @returns {Promise<void>} Resolves when connected.
 */
export async function startTestDatabase () {
  mongoose.set('strict', 'throw')
  mongoose.set('strictQuery', true)

  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
  await mongoose.connect(replSet.getUri())
}

/**
 * Disconnects Mongoose and stops the in-memory database.
 *
 * @returns {Promise<void>} Resolves when stopped.
 */
export async function stopTestDatabase () {
  await mongoose.disconnect()
  await replSet.stop()
}

/**
 * Empties all collections. Indexes are kept.
 *
 * @returns {Promise<void>} Resolves when cleared.
 */
export async function clearTestDatabase () {
  const collections = Object.values(mongoose.connection.collections)
  await Promise.all(collections.map((collection) => collection.deleteMany({})))
}
