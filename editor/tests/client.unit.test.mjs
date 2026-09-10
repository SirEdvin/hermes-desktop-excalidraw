import { callScene } from '../../src/scene-client.js'
import { test } from 'node:test'
import assert from 'node:assert/strict'

test('transport serializes malicious-looking drawing text as data', async () => {
  const raw = '"}); globalThis.executed = true; //\u2028</script>'
  const guest = { hermesDrawingHandoff: async request => ({ ...request, ok: true, result: { raw: request.raw } }) }
  const webview = { executeJavaScript: async script => new Function('window', `return ${script}`)(guest) }
  assert.deepEqual(await callScene(webview, 'profile/workspace', 'preview', { raw }), { raw })
  assert.equal(globalThis.executed, undefined)
})
test('transport rejects unavailable editor, wrong response and late scope response', async () => {
  await assert.rejects(callScene(null, 'a', 'snapshot'), /not ready/)
  await assert.rejects(callScene({ executeJavaScript: async () => ({ version: 1, id: 'old', scope: 'a', ok: true }) }, 'a', 'snapshot'), /stale/)
  let active = true
  const webview = { executeJavaScript: async script => {
    active = false
    return new Function('window', `return ${script}`)({ hermesDrawingHandoff: request => ({ ...request, ok: true, result: {} }) })
  } }
  await assert.rejects(callScene(webview, 'a', 'snapshot', {}, () => active), /scope changed/)
})
