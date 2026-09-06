// Run only against an isolated Hermes Desktop instance, never a user's session.
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, mkdir, rename, symlink, unlink } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'

assert.equal(process.env.EXCALIDRAW_ISOLATED_TEST, '1', 'Set EXCALIDRAW_ISOLATED_TEST=1 only for a disposable Desktop instance')
const hermes = process.env.HERMES_SOURCE || path.join(homedir(), '.hermes/hermes-agent')
const { CDP } = await import(pathToFileURL(path.join(hermes, 'apps/desktop/scripts/perf/lib/cdp.mjs')))
const port = Number(process.env.CDP_PORT || 9334)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workspace = await mkdtemp(path.join(tmpdir(), 'excalidraw-e2e-'))
const second = `${workspace}/second`
await mkdir(second)
const results = []
const cdp = await CDP.connect({ port, match: '5174', timeoutMs: 15000 })
// Keep dynamic-import promises rooted while Chromium awaits them over CDP.
const evaluate = cdp.eval.bind(cdp)
cdp.eval = expression => bounded(evaluate(`window.__excalidrawCheck = (${expression})`), 'host evaluation')
let guest
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function bounded(promise, label) {
  let timer
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`CDP timeout: ${label}`)), 10000)
    })])
  } finally { clearTimeout(timer) }
}
async function until(fn, description) {
  const end = Date.now() + 15000
  while (Date.now() < end) {
    try { if (await fn()) return } catch {}
    await pause(150)
  }
  throw new Error(`Timed out: ${description}`)
}
const status = () => cdp.eval(`document.querySelector('[aria-label="Excalidraw workspace"] [role="status"]')?.textContent`)
const toggle = () => cdp.eval(`(async()=>{const {registry}=await import('/src/contrib/registry.ts');const {PALETTE_AREA}=await import('/src/sdk/index.ts');const c=registry.getArea(PALETTE_AREA).find(c=>c.data?.id==='hermes-desktop-excalidraw.toggle');if(!c)throw Error('No toggle');c.data.run();return true})()`)
async function switchWorkspace(target) {
  await cdp.eval(`(async()=>{const s=await import('/src/store/session.ts');s.setCurrentCwd(${JSON.stringify(target)});return true})()`)
  if (await cdp.eval(`Boolean(document.querySelector('[aria-label="Excalidraw workspace"]'))`)) {
    await until(() => cdp.eval(`document.querySelector('webview')?.src.includes(${JSON.stringify(encodeURIComponent(target))})`), 'workspace view switched')
  }
}
const click = text => cdp.eval(`(()=>{const b=[...document.querySelectorAll('[aria-label="Excalidraw workspace"] button')].find(e=>e.textContent===${JSON.stringify(text)});if(!b)throw Error('Button missing');b.click();return true})()`)
async function attach() {
  guest?.close()
  await until(async () => {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    const target = targets.find(t => t.type === 'webview' && t.url.includes('desktop/editor.html'))
    if (!target) return false
    guest = await bounded(CDP.open(target.webSocketDebuggerUrl), 'guest connection')
    if (await bounded(guest.eval('Boolean(window.hermesExcalidraw?.state().loaded)'), 'guest state')) return true
    guest.close()
    return false
  }, 'guest loaded')
}
function agent(tool, args = {}) {
  const code = `import json,sys; sys.path.insert(0,${JSON.stringify(root)}); from hermes_desktop_excalidraw.tools import ${tool}; print(${tool}(json.loads(sys.argv[1])))`
  return JSON.parse(execFileSync(path.join(hermes, 'venv/bin/python'), ['-c', code, JSON.stringify(args)], {
    cwd: tmpdir(), env: { ...process.env, TERMINAL_CWD: workspace }, encoding: 'utf8'
  }))
}
async function draw(xOffset = 0) {
  await guest.eval(`document.querySelector('[data-testid="toolbar-rectangle"]').click()`)
  const size = await guest.eval(`({w:innerWidth,h:innerHeight})`)
  const x = Math.max(80, size.w * 0.55 + xOffset), y = Math.max(220, size.h * 0.55)
  await guest.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await guest.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await guest.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + 70, y: y + 65, button: 'left', buttons: 1 })
  await guest.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + 70, y: y + 65, button: 'left', clickCount: 1 })
}
async function record(name, fn) {
  await fn()
  results.push(name)
  console.log(`PASS ${name}`)
}
try {
  await until(() => cdp.eval(`(async()=>{const {registry}=await import('/src/contrib/registry.ts');const {PALETTE_AREA}=await import('/src/sdk/index.ts');return registry.getArea(PALETTE_AREA).some(c=>c.data?.id==='hermes-desktop-excalidraw.toggle')})()`), 'plugin registration')
  await switchWorkspace(workspace)
  if (!await cdp.eval(`Boolean(document.querySelector('[aria-label="Excalidraw workspace"]'))`)) await toggle()
  await attach()
  await until(async () => await status() === 'Saved', 'initial read')
  await record('first edit persists and agent reads it', async () => {
    assert.equal(agent('excalidraw_read_scene').exists, false)
    await draw()
    await until(() => agent('excalidraw_read_scene').scene.elements.length === 1, 'human edit persisted')
    await until(async () => await status() === 'Saved', 'saved state')
  })
  await record('agent replacement converges without reload; stale agent rejected', async () => {
    const old = agent('excalidraw_read_scene')
    const scene = { ...old.scene, elements: old.scene.elements.map(e => ({ ...e, x: e.x + 25, version: e.version + 1 })) }
    const written = agent('excalidraw_replace_scene', { scene, expected_revision: old.revision })
    assert.equal(written.success, true)
    await until(async () => (await guest.eval('window.hermesExcalidraw.state()')).revision === written.revision, 'agent revision displayed')
    assert.equal(agent('excalidraw_replace_scene', { scene: old.scene, expected_revision: old.revision }).error_code, 'revision_conflict')
  })
  await record('single toggle closes last pane and reopens saved drawing', async () => {
    const before = agent('excalidraw_read_scene')
    await toggle()
    await until(() => cdp.eval(`!document.querySelector('[aria-label="Excalidraw workspace"]')`), 'pane closed')
    await toggle()
    await attach()
    assert.equal((await guest.eval('window.hermesExcalidraw.state()')).revision, before.revision)
  })
  await record('user-after-agent conflict preserves both versions across close and workspace switch', async () => {
    const before = agent('excalidraw_read_scene')
    await draw(-80)
    const local = await guest.eval('window.hermesExcalidraw.state()')
    const scene = { ...before.scene, elements: [] }
    assert.equal(agent('excalidraw_replace_scene', { scene, expected_revision: before.revision }).success, true)
    await until(async () => await status() === 'Drawing changed on disk', 'conflict displayed')
    assert.equal((await guest.eval('window.hermesExcalidraw.state()')).scene.elements.length, local.scene.elements.length)
    assert.equal(agent('excalidraw_read_scene').scene.elements.length, 0)
    await toggle()
    await until(() => cdp.eval(`!document.querySelector('webview')`), 'closed conflicted pane')
    await toggle()
    await attach()
    await until(async () => await status() === 'Drawing changed on disk', 'restored conflict')
    await switchWorkspace(second)
    await attach()
    assert.equal((await guest.eval('window.hermesExcalidraw.state()')).scene.elements.length, 0)
    await switchWorkspace(workspace)
    await attach()
    await until(async () => await status() === 'Drawing changed on disk', 'conflict after switching back')
    assert.equal((await guest.eval('window.hermesExcalidraw.state()')).scene.elements.length, local.scene.elements.length)
    await click('Keep mine')
    await until(async () => await status() === 'Saved', 'explicit keep mine')
    assert.equal(agent('excalidraw_read_scene').scene.elements.length, local.scene.elements.length)
  })
  await record('write failure preserves canonical bytes and draft; Retry recovers', async () => {
    const lock = path.join(workspace, '.hermes.excalidraw.lock')
    const before = await readFile(path.join(workspace, 'hermes.excalidraw'))
    await rename(lock, `${lock}.backup`)
    await symlink(`${lock}.backup`, lock)
    try {
      await draw(-40)
      await until(async () => await status() === 'Drawing unavailable', 'write error')
      assert.deepEqual(await readFile(path.join(workspace, 'hermes.excalidraw')), before)
      assert.equal((await guest.eval('window.hermesExcalidraw.state()')).dirty, true)
      await toggle()
      await until(() => cdp.eval(`!document.querySelector('webview')`), 'close failed writer')
      await toggle()
      await attach()
      assert.equal((await guest.eval('window.hermesExcalidraw.state()')).dirty, true)
      await until(async () => await status() === 'Drawing unavailable', 'restored save failure')
    } finally {
      await unlink(lock)
      await rename(`${lock}.backup`, lock)
    }
    await click('Retry')
    await until(async () => await status() === 'Saved', 'retry persisted')
    assert.notDeepEqual(await readFile(path.join(workspace, 'hermes.excalidraw')), before)
  })
  await record('invalid and oversized files stay untouched, with recovery after repair', async () => {
    const file = path.join(second, 'hermes.excalidraw')
    for (const raw of ['invalid JSON', ' '.repeat(5 * 1024 * 1024 + 1)]) {
      await writeFile(file, raw)
      await switchWorkspace(second)
      await until(async () => await status() === 'Drawing unavailable', 'invalid document error')
      assert.equal(await readFile(file, 'utf8'), raw)
      await writeFile(file, JSON.stringify(agent('excalidraw_read_scene').scene))
      await click('Retry')
      await attach()
      await until(async () => await status() === 'Saved', 'repaired document')
      await switchWorkspace(workspace)
      await attach()
    }
  })
  await record('a save completing after workspace switch cannot change the new workspace', async () => {
    const before = agent('excalidraw_read_scene')
    const holder = spawn(path.join(hermes, 'venv/bin/python'), ['-c',
      'import fcntl,os,sys; fd=os.open(sys.argv[1],os.O_WRONLY); fcntl.flock(fd,fcntl.LOCK_EX); print("ready",flush=True); sys.stdin.read()',
      path.join(workspace, '.hermes.excalidraw.lock')])
    await once(holder.stdout, 'data')
    const exited = once(holder, 'exit')
    try {
      await draw(-120)
      await until(async () => await status() === 'Saving…', 'save started')
      await switchWorkspace(second)
      await attach()
      const newState = await guest.eval('window.hermesExcalidraw.state()')
      holder.stdin.end()
      await exited
      await until(() => agent('excalidraw_read_scene').revision !== before.revision, 'old save completed')
      assert.equal((await guest.eval('window.hermesExcalidraw.state()')).revision, newState.revision)
    } finally { holder.stdin.end() }
    await switchWorkspace(workspace)
    await attach()
    await until(async () => await status() === 'Drawing changed on disk', 'unacknowledged saved draft recovered')
    await click('Load disk')
    await until(async () => await status() === 'Saved', 'explicit load disk')
  })
  await record('palette toggle is keyboard accessible', async () => {
    const header = await cdp.eval(`(()=>{const r=document.querySelector('[aria-label="Excalidraw workspace"] header').getBoundingClientRect();return {x:r.x+20,y:r.y+10}})()`)
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...header, button: 'left', clickCount: 1 })
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...header, button: 'left', clickCount: 1 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75, modifiers: 2 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75, modifiers: 0 })
    await until(() => cdp.eval(`Boolean(document.querySelector('[role="combobox"]'))`), 'command palette')
    await cdp.send('Input.insertText', { text: 'Excalidraw: toggle drawing pane' })
    await until(() => cdp.eval(`Boolean([...document.querySelectorAll('[role="option"]')].find(e=>e.textContent.includes('Excalidraw: toggle drawing pane')))`), 'toggle option')
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', windowsVirtualKeyCode: 13 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', windowsVirtualKeyCode: 13 })
    await until(() => cdp.eval(`!document.querySelector('[aria-label="Excalidraw workspace"]')`), 'keyboard close')
    await toggle()
    await attach()
  })
  await record('native pane resizing resizes the editor viewport', async () => {
    const before = await guest.eval('innerWidth')
    const splitter = await cdp.eval(`(()=>{const e=[...document.querySelectorAll('[role="separator"]')].at(-1);const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...splitter })
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...splitter, button: 'left', clickCount: 1 })
    const resizedX = splitter.x + (before > 420 ? 90 : -90)
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: resizedX, y: splitter.y, button: 'left', buttons: 1 })
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: resizedX, y: splitter.y, button: 'left', clickCount: 1 })
    await until(async () => await guest.eval('innerWidth') !== before, 'editor resize')
    assert.ok(await guest.eval('innerWidth >= 320'))
  })
  await record('offline guest editing requires no external assets', async () => {
    const external = []
    guest.on('Network.requestWillBeSent', event => { if (/^https?:/.test(event.request.url)) external.push(event.request.url) })
    await guest.send('Network.enable')
    await guest.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
    const before = agent('excalidraw_read_scene')
    await draw(-30)
    await until(() => agent('excalidraw_read_scene').revision !== before.revision, 'offline edit saved')
    assert.deepEqual(external, [])
    await guest.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  })
  await record('simulated backend outage retains the draft and Retry uses the real backend', async () => {
    const source = await readFile(path.join(root, 'desktop/plugin.js'), 'utf8')
    const faulted = source.replace('register(ctx) {', `register(ctx) {
      const realRest = ctx.rest;
      ctx = { ...ctx, rest: (...args) => {
        window.__excalidrawFaultCalls = (window.__excalidrawFaultCalls || 0) + 1;
        return window.__excalidrawOutage ? Promise.reject(new Error('Simulated backend unavailable')) : realRest(...args);
      } };`)
    assert.notEqual(faulted, source)
    await cdp.eval(`(async()=>{const m=await import('/src/contrib/runtime-loader.ts');return m.loadRuntimePlugin(${JSON.stringify(faulted)},'excalidraw-fault-test')})()`)
    await toggle()
    await until(() => cdp.eval(`!document.querySelector('webview')`), 'fault harness closed')
    await toggle()
    await attach()
    await until(() => cdp.eval('window.__excalidrawFaultCalls > 0'), 'fault harness called')
    await until(async () => await status() === 'Saved', 'fault harness ready')
    const before = agent('excalidraw_read_scene')
    await cdp.eval('window.__excalidrawOutage = true')
    try {
      await draw(-60)
      await until(async () => await status() === 'Drawing unavailable', 'backend error')
      assert.equal(agent('excalidraw_read_scene').revision, before.revision)
      assert.equal((await guest.eval('window.hermesExcalidraw.state()')).dirty, true)
    } finally { await cdp.eval('window.__excalidrawOutage = false') }
    await click('Retry')
    await until(async () => await status() === 'Saved', 'backend recovered')
    assert.notEqual(agent('excalidraw_read_scene').revision, before.revision)
  })
  await record('hot reload keeps one toggle and restores the drawing', async () => {
    const source = await readFile(path.join(root, 'desktop/plugin.js'), 'utf8')
    assert.equal(await cdp.eval(`(async()=>{const m=await import('/src/contrib/runtime-loader.ts');return m.loadRuntimePlugin(${JSON.stringify(source)},'excalidraw-live-test')})()`), 'hermes-desktop-excalidraw')
    await attach()
    await until(async () => await status() === 'Saved', 'hot reload restored')
    assert.equal(await cdp.eval(`(async()=>{const {registry}=await import('/src/contrib/registry.ts');const {PALETTE_AREA}=await import('/src/sdk/index.ts');return registry.getArea(PALETTE_AREA).filter(c=>c.data?.id==='hermes-desktop-excalidraw.toggle').length})()`), 1)
  })
  await record('renderer restart restores open state and saved drawing', async () => {
    guest.close()
    guest = null
    await bounded(cdp.send('Page.reload'), 'page reload')
    await pause(1000)
    await until(() => cdp.eval(`Boolean(document.querySelector('webview'))`), 'pane after reload')
    await attach()
    await until(async () => await status() === 'Saved', 'restart restored')
    assert.equal((await guest.eval('window.hermesExcalidraw.state()')).revision, agent('excalidraw_read_scene').revision)
  })
  await record('desktop disable and re-enable preserves canonical drawing and open state', async () => {
    const before = agent('excalidraw_read_scene')
    await cdp.eval(`(async()=>{const m=await import('/src/contrib/plugins-store.ts');await m.setPluginEnabled('hermes-desktop-excalidraw',false);return true})()`)
    await until(() => cdp.eval(`!document.querySelector('[aria-label="Excalidraw workspace"]')`), 'disabled pane removed')
    assert.equal(agent('excalidraw_read_scene').revision, before.revision)
    await cdp.eval(`(async()=>{const m=await import('/src/contrib/plugins-store.ts');await m.setPluginEnabled('hermes-desktop-excalidraw',true);return true})()`)
    await attach()
    assert.equal((await guest.eval('window.hermesExcalidraw.state()')).revision, before.revision)
  })
  const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(path.join(workspace, 'desktop.png'), Buffer.from(screenshot.data, 'base64'))
} finally {
  guest?.close()
  cdp.close()
  await writeFile(path.join(workspace, 'verification.json'), JSON.stringify({ results, workspace }, null, 2))
  console.log(`Evidence: ${workspace}`)
}
