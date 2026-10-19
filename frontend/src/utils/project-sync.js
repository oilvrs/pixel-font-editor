/**
 * Saves the changes of one project to the server.
 *
 * The editor reports changed glyphs with markDirty() and a changed name or
 * margin with markMeta(). A moment later, they are sent: the glyphs as one
 * batch, then the name and margin. Unsaved changes are also written to
 * localStorage (see pending.js) a moment after each change.
 *
 * A failed save because of the network, or a server that is busy, is tried
 * again with a growing delay. A 409 means the project was changed elsewhere:
 * onConflict() is asked to resolve it, by calling discard() or rebase().
 *
 * Status is reported through onStatus(state, message). The states are
 * 'saved', 'saving', 'unsaved', 'offline', 'conflict' and 'error'.
 *
 * @version 0.1.0
 */

import { buildBatch, retryDelay } from '../core/sync.js'
import { glyphIsEmpty, serializeGlyph } from '../core/glyph.js'
import { saveGlyphs, updateProject } from './api.js'
import { clearPending, savePending } from './pending.js'

const PERSIST_DELAY_MS = 300
const SYNC_DELAY_MS = 1500
const KEEPALIVE_LIMIT = 60000 // Requests that outlive the page may not be larger than 64 KB
const MAX_CONFLICTS = 3

export class ProjectSync {
  /**
   * @param {Object} options
   * @param {string} options.projectId
   * @param {number} options.revision - the revision of the project as loaded
   * @param {Function} options.getGlyph - (char) => { grid, shapes, spacing } or a falsy value
   * @param {Function} options.onStatus - (state, message) => void
   * @param {Function} options.onConflict - async () => void, must call discard() or rebase()
   */
  constructor({ projectId, revision, getGlyph, onStatus, onConflict }) {
    this.projectId = projectId
    this.revision = revision
    this.getGlyph = getGlyph
    this.onStatus = onStatus
    this.onConflict = onConflict

    this.dirty = new Map() // char -> version, increased on every change
    this.meta = {} // { name?, margin? } that has not been sent
    this.counter = 0
    this.state = 'saved'
    this.message = ''
    this.running = null // The promise of the current run, if there is one
    this.rerun = false
    this.sending = false // True while a batch of glyphs is on its way
    this.attempt = 0
    this.conflicts = 0
    this.disposed = false

    this.persistTimer = null
    this.syncTimer = null
    this.retryTimer = null
  }

  /**
   * Notes that a glyph has changed.
   * @param {string} char
   */
  markDirty(char) {
    this.dirty.set(char, ++this.counter)
    this.schedule()
  }

  /**
   * Notes that the name or the margin has changed.
   * @param {Object} patch - { name?, margin? }
   */
  markMeta(patch) {
    Object.assign(this.meta, patch)
    this.schedule()
  }

  /**
   * The glyphs that have changed and are not saved.
   * @returns {string[]}
   */
  dirtyChars() {
    return [...this.dirty.keys()]
  }

  /**
   * Whether anything is waiting to be saved.
   * @returns {boolean}
   */
  hasUnsynced() {
    return this.dirty.size > 0 || Object.keys(this.meta).length > 0
  }

  /**
   * Gives up the unsaved changes and continues from the revision on the server.
   * @param {number} revision
   */
  discard(revision) {
    this.dirty.clear()
    this.meta = {}
    this.revision = revision
    this.persist()
  }

  /**
   * Keeps the unsaved changes, to be saved on top of the revision on the server.
   * @param {number} revision
   */
  rebase(revision) {
    this.revision = revision
  }

  /**
   * Saves everything now. Used when the page is hidden or the editor is closed.
   * @param {Object} [options]
   * @param {boolean} [options.keepalive] - let the request finish even if the page is closed
   * @returns {Promise<void>}
   */
  flush({ keepalive = false } = {}) {
    clearTimeout(this.persistTimer)
    clearTimeout(this.syncTimer)

    this.persist()

    return this.hasUnsynced() ? this.run({ keepalive }) : Promise.resolve()
  }

  /**
   * Stops all timers. A save that is on its way still finishes.
   */
  dispose() {
    this.disposed = true
    clearTimeout(this.persistTimer)
    clearTimeout(this.syncTimer)
    clearTimeout(this.retryTimer)
  }

  /**
   * Plans the writes to localStorage and to the server after a change.
   */
  schedule() {
    this.setStatus('unsaved')

    clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => this.persist(), PERSIST_DELAY_MS)

    clearTimeout(this.syncTimer)
    this.syncTimer = setTimeout(() => this.run(), SYNC_DELAY_MS)
  }

  /**
   * Writes the unsaved changes to localStorage, or removes them if there are none.
   */
  persist() {
    clearTimeout(this.persistTimer)

    if (!this.hasUnsynced()) {
      clearPending(this.projectId)
      return
    }

    const glyphs = {}

    for (const char of this.dirty.keys()) {
      const glyph = this.getGlyph(char)
      glyphs[char] = glyph && !glyphIsEmpty(glyph) ? serializeGlyph(glyph) : null
    }

    savePending(this.projectId, {
      baseRevision: this.revision,
      // The revision the project gets if the batch that is on its way is accepted.
      maybeRevision: this.sending ? this.revision + 1 : null,
      glyphs,
      meta: this.meta,
    })
  }

  /**
   * Starts a save, or asks the save that is running to go around once more.
   * @param {Object} [options]
   * @param {boolean} [options.keepalive]
   * @returns {Promise<void>}
   */
  run({ keepalive = false } = {}) {
    clearTimeout(this.retryTimer)

    if (this.running) {
      this.rerun = true
      return this.running
    }

    this.running = this.loop(keepalive).finally(() => {
      this.running = null
    })

    return this.running
  }

  /**
   * Saves until nothing is left, or until a save fails.
   * @param {boolean} keepalive
   * @returns {Promise<void>}
   */
  async loop(keepalive) {
    do {
      this.rerun = false
      if (!(await this.syncOnce(keepalive))) return
    } while (this.rerun && !this.disposed)
  }

  /**
   * Sends the changed glyphs, then the changed name and margin.
   * @param {boolean} keepalive
   * @returns {Promise<boolean>} true if everything was saved or the conflict was resolved
   */
  async syncOnce(keepalive) {
    try {
      if (this.dirty.size > 0) {
        const sent = new Map(this.dirty)
        const batch = buildBatch([...sent.keys()], this.getGlyph, this.revision)
        const fits = JSON.stringify(batch).length < KEEPALIVE_LIMIT

        this.sending = true
        this.setStatus('saving')

        const result = await saveGlyphs(this.projectId, batch, { keepalive: keepalive && fits })

        this.sending = false
        this.revision = result.revision

        // A glyph that changed while the request was on its way stays unsaved.
        for (const [char, version] of sent) {
          if (this.dirty.get(char) === version) this.dirty.delete(char)
        }
      }

      if (Object.keys(this.meta).length > 0) {
        const sent = { ...this.meta }

        this.setStatus('saving')
        await updateProject(this.projectId, sent)

        for (const key of Object.keys(sent)) {
          if (this.meta[key] === sent[key]) delete this.meta[key]
        }
      }
    } catch (error) {
      this.sending = false
      return this.handleError(error)
    }

    this.attempt = 0
    this.conflicts = 0
    this.persist()
    this.setStatus(this.hasUnsynced() ? 'unsaved' : 'saved')

    return true
  }

  /**
   * Decides what to do after a failed request.
   * @param {Error} error - an ApiError, or any other error
   * @returns {Promise<boolean>} true if the loop should go around again
   */
  async handleError(error) {
    this.persist()

    if (this.disposed) return false

    // 401: the session has ended. The app shows the login page, and the
    // changes are kept in localStorage until the project is opened again.
    if (error.status === 401) {
      this.setStatus('unsaved')
      return false
    }

    if (error.status === 409) {
      this.conflicts += 1

      if (this.conflicts > MAX_CONFLICTS) {
        this.setStatus('error', 'The project keeps changing elsewhere. Reload the page.')
        return false
      }

      this.setStatus('conflict')

      try {
        await this.onConflict()
      } catch (conflictError) {
        this.setStatus('error', conflictError.message)
        return false
      }

      this.rerun = true
      return true
    }

    if (error.status === 0 || error.status === 429 || error.status >= 500) {
      this.attempt += 1
      this.setStatus('offline', error.message)
      this.retryTimer = setTimeout(() => this.run(), retryDelay(this.attempt))
      return false
    }

    this.setStatus('error', error.message)
    return false
  }

  /**
   * Reports a new status, if it is not the same as the last one.
   * @param {string} state
   * @param {string} [message]
   */
  setStatus(state, message = '') {
    if (this.disposed || (state === this.state && message === this.message)) return

    this.state = state
    this.message = message
    this.onStatus(state, message)
  }
}
