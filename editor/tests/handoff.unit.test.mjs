import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseScene, MAX_SCENE_BYTES } from '../../src/scene.js'
import { prepareHandoff, readResult, instructions } from '../../src/handoff-files.js'

const scene = JSON.stringify({ type: 'excalidraw', version: 2, elements: [
  { id: 'box', type: 'rectangle', x: 0, y: 0, width: 120, height: 80 }
], appState: {}, files: {} })
const id = '00000000-0000-4000-8000-000000000001'
function native() {
  const files = new Map()
  return { files,
    readDir: async () => ({ entries: [...files.keys()].map(path => ({ name: path.split('/').at(-1), path })) }),
    writeTextFile: async (path, text) => { files.set(path, text); return { path } },
    readFileText: async path => {
      if (!files.has(path)) throw new Error('ENOENT')
      const text = files.get(path)
      return { path, text, truncated: false, byteSize: Buffer.byteLength(text) }
    }
  }
}
test('valid drawing and empty drawing parse without evaluating text', () => {
  assert.equal(parseScene(scene).elements[0].id, 'box')
  assert.equal(parseScene('{"type":"excalidraw","elements":[]}').elements.length, 0)
})
test('untrusted scenes reject partial data, invalid coordinates and remote embeds', () => {
  for (const value of ['{', 'null', '{"type":"excalidraw","elements":{}}', scene.replace('"x":0', '"x":"no"'), scene.replace('rectangle', 'embeddable')]) {
    assert.throws(() => parseScene(value))
  }
  assert.throws(() => parseScene(' '.repeat(MAX_SCENE_BYTES + 1)))
  assert.throws(() => parseScene(scene.replace('"id":"box"', '"id":"box","link":"javascript:alert(1)"')))
})
test('fresh Unicode handoff is verified and instructions preserve exact paths', async () => {
  const api = native()
  const result = await prepareHandoff(api, '/tmp/дерево with spaces', scene, '["p","w"]', id)
  assert.equal(api.files.size, 1)
  assert.equal(api.files.get(result.input), scene)
  assert.notEqual(result.input, result.output)
  assert.ok(instructions(result).includes(JSON.stringify(result.input)))
  assert.ok(instructions(result).includes(JSON.stringify(result.output)))
  api.files.set(result.output, scene)
  assert.equal(await readResult(api, result), scene)
})
test('collisions, missing APIs, directory failure and bad readback fail closed', async () => {
  const api = native()
  await prepareHandoff(api, '/tmp', scene, 'a', id)
  await assert.rejects(prepareHandoff(api, '/tmp', scene, 'a', id), /exist/)
  await assert.rejects(prepareHandoff({}, '/tmp', scene, 'a', id), /Update Hermes/)
  await assert.rejects(prepareHandoff({ ...native(), readDir: async () => ({ error: 'EACCES', entries: [] }) }, '/tmp', scene, 'a', id), /directory/i)
  await assert.rejects(prepareHandoff({ ...native(), readFileText: async () => ({ text: 'wrong', truncated: false }) }, '/tmp', scene, 'a', id), /verif/i)
})
test('truncation and write failure never advertise a valid handoff', async () => {
  await assert.rejects(prepareHandoff({ ...native(), writeTextFile: async () => { throw new Error('Disk full') } }, '/tmp', scene, 'a', id), /Disk full/)
  await assert.rejects(readResult({ ...native(), readFileText: async () => ({ text: scene, truncated: true }) }, { output: '/tmp/out' }), /large|truncat/i)
})
test('scope cancellation prevents write after a delayed directory read', async () => {
  let active = true
  const api = native()
  api.readDir = async () => { active = false; return { entries: [] } }
  await assert.rejects(prepareHandoff(api, '/tmp', scene, 'a', id, () => active), /closed|scope/i)
  assert.equal(api.files.size, 0)
})

test('a POSIX folder containing a literal backslash stays inside that folder', async () => {
  const api = native()
  const result = await prepareHandoff(api, '/tmp/folder\\with\\slashes', scene, 'a', id)
  assert.equal(result.input, `/tmp/folder\\with\\slashes/hermes-drawing-${id}.input.excalidraw`)
})
