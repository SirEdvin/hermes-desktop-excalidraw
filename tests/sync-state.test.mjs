import test from 'node:test'
import assert from 'node:assert/strict'

import { remoteAction, saveLeavesDirty } from '../desktop/src/sync-state.js'

test('remote revisions load only when local work is clean', () => {
  assert.equal(remoteAction(null, false, 'a'), 'load')
  assert.equal(remoteAction('a', false, 'a'), 'ignore')
  assert.equal(remoteAction('a', false, 'b'), 'load')
  assert.equal(remoteAction('a', true, 'b'), 'conflict')
  assert.equal(remoteAction(null, true, 'b'), 'conflict')
})

test('an edit during a save remains dirty', () => {
  assert.equal(saveLeavesDirty(2, 2), false)
  assert.equal(saveLeavesDirty(3, 2), true)
})
