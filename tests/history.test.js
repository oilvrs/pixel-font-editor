import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHistory, pushState, undoState, redoState } from '../src/core/history.js'

test('undo returns the state from before the change, redo returns the change', () => {
  const history = createHistory()
  const before = new Uint8Array([0, 0, 0, 0])
  const after = new Uint8Array([1, 0, 0, 0])

  pushState(history, before)
  assert.deepEqual(undoState(history, after), before)
  assert.deepEqual(redoState(history, before), after)
})

test('undo and redo return null when there is nothing to step to', () => {
  const history = createHistory()
  const current = new Uint8Array([0, 0])
  assert.equal(undoState(history, current), null)
  assert.equal(redoState(history, current), null)
})

test('a new change clears the redo stack', () => {
  const history = createHistory()
  pushState(history, new Uint8Array([0]))
  undoState(history, new Uint8Array([1]))
  pushState(history, new Uint8Array([0]))
  assert.equal(redoState(history, new Uint8Array([2])), null)
})

test('the history keeps at most `limit` steps', () => {
  const history = createHistory(3)
  for (let i = 0; i < 5; i++) pushState(history, new Uint8Array([i]))
  assert.equal(history.past.length, 3)
  assert.deepEqual(history.past[0], new Uint8Array([2]))
})

test('pushState stores a copy, not a reference', () => {
  const history = createHistory()
  const pixels = new Uint8Array([0, 0])
  pushState(history, pixels)
  pixels[0] = 1
  assert.deepEqual(history.past[0], new Uint8Array([0, 0]))
})
