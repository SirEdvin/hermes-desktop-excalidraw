import { _electron as electron, expect } from '@playwright/test'
import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'

if (process.env.EXCALIDRAW_ISOLATED_TEST !== '1' || !process.env.HERMES_SOURCE) {
  throw new Error('Set EXCALIDRAW_ISOLATED_TEST=1 and HERMES_SOURCE to a built Hermes source checkout with its development renderer running.')
}
const desktop = join(process.env.HERMES_SOURCE, 'apps/desktop')
const executablePath = createRequire(join(desktop, 'package.json'))('electron')
const root = await mkdtemp(join(tmpdir(), 'excalidraw-desktop-'))
const home = join(root, 'home')
const install = join(home, 'desktop-plugins/hermes-desktop-excalidraw')
await mkdir(install, { recursive: true })
for (const file of ['plugin.js', 'editor.html']) {
  await copyFile(resolve(import.meta.dirname, '../..', file), join(install, file))
}
const env = Object.fromEntries(['PATH', 'HOME', 'DISPLAY', 'XAUTHORITY', 'LANG', 'XDG_RUNTIME_DIR'].filter(key => process.env[key]).map(key => [key, process.env[key]]))
const reservation = createServer()
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
const port = reservation.address().port
await new Promise(resolve => reservation.close(resolve))
Object.assign(env, {
  HERMES_HOME: home,
  HERMES_PROFILE: 'default',
  HERMES_DESKTOP_USER_DATA_DIR: join(root, 'user-data'),
  HERMES_DESKTOP_DEV_SERVER: process.env.HERMES_DESKTOP_DEV_SERVER || 'http://127.0.0.1:5174',
  HERMES_DESKTOP_REMOTE_URL: `http://127.0.0.1:${port}`,
  HERMES_DESKTOP_REMOTE_TOKEN: randomUUID()
})
// Hermes's own startup requires its core backend; no Python plugin is installed.
const backend = spawn(join(process.env.HERMES_SOURCE, 'venv/bin/python'), [
  '-m', 'hermes_cli.main', 'dashboard', '--isolated', '--skip-build', '--no-open', '--port', String(port)
], {
  cwd: process.env.HERMES_SOURCE,
  env: { ...env, HERMES_DASHBOARD_SESSION_TOKEN: env.HERMES_DESKTOP_REMOTE_TOKEN },
  stdio: 'ignore',
  detached: true
})
backend.on('error', () => {})
let app
const checks = []
async function launch() {
  app = await electron.launch({ executablePath, args: [desktop, '--no-sandbox'], env, timeout: 30_000 })
  await expect.poll(() => app.windows().some(page => page.url().startsWith(env.HERMES_DESKTOP_DEV_SERVER)), { timeout: 30_000 }).toBe(true)
  const page = app.windows().find(page => page.url().startsWith(env.HERMES_DESKTOP_DEV_SERVER))
  // Exercise the host's real "choose a provider later" preference in this fresh home.
  await page.evaluate(() => window.__excalidrawCheck = import('/src/store/onboarding.ts').then(module => module.dismissFirstRunOnboarding()))
  return page
}
async function guestScript(script) {
  return app.evaluate(async ({ webContents }, script) => {
    const guest = webContents.getAllWebContents().find(view => view.getType() === 'webview' && view.getURL().includes('/hermes-desktop-excalidraw/editor.html'))
    return guest ? guest.executeJavaScript(script, true) : null
  }, script)
}
async function ready() {
  await expect.poll(() => guestScript('Boolean(document.querySelector("[data-testid=toolbar-rectangle]"))'), { timeout: 20_000 }).toBe(true)
}
async function toggle(page) {
  await page.evaluate(() => window.__excalidrawCheck = (async () => {
    const { registry } = await import('/src/contrib/registry.ts')
    const { PALETTE_AREA } = await import('/src/sdk/index.ts')
    registry.getArea(PALETTE_AREA).find(item => item.data?.id === 'hermes-desktop-excalidraw.toggle').data.run()
  })())
}
try {
  await expect.poll(async () => {
    try { return (await fetch(`${env.HERMES_DESKTOP_REMOTE_URL}/api/status`)).ok } catch { return false }
  }, { timeout: 60_000 }).toBe(true)
  let page = await launch()
  await page.waitForFunction(() => typeof window.hermesDesktop?.desktopPluginsRoot === 'function')
  await expect.poll(() => page.evaluate(() => window.__excalidrawCheck = import('/src/contrib/plugins-store.ts').then(module => module.$pluginRecords.get()['hermes-desktop-excalidraw']?.status)), { timeout: 20_000 }).toBe('loaded')
  await toggle(page)
  await ready()
  checks.push('Direct root installation discovered and editor opened with no Python plugin installed')
  console.log(checks.at(-1))
  await guestScript('document.querySelector("[data-testid=toolbar-rectangle]").closest("label").click()')
  const bounds = await page.locator('webview[aria-label="Excalidraw editor"]').boundingBox()
  await page.mouse.move(bounds.x + 250, bounds.y + 240)
  await page.mouse.down()
  await page.mouse.move(bounds.x + 370, bounds.y + 340, { steps: 5 })
  await page.mouse.up()
  const read = 'JSON.parse(localStorage.getItem(`hermes.excalidraw.scene:${location.hash.slice(1)}`))'
  await expect.poll(async () => (await guestScript(read))?.elements.length).toBe(1)
  const saved = await guestScript(read)
  await toggle(page)
  await expect(page.locator('webview[aria-label="Excalidraw editor"]')).toHaveCount(0)
  await toggle(page)
  await ready()
  expect((await guestScript(read)).elements[0].id).toBe(saved.elements[0].id)
  checks.push('Mouse drawing saved and recovered after closing/reopening the pane')
  console.log(checks.at(-1))
  const originalWorkspace = await page.evaluate(() => window.__excalidrawCheck = import('/src/sdk/index.ts').then(module => module.host.state.cwd.get()))
  const otherWorkspace = join(root, 'workspace-b')
  await mkdir(otherWorkspace)
  await page.evaluate(workspace => window.__excalidrawCheck = import('/src/store/session.ts').then(module => module.setCurrentCwd(workspace)), otherWorkspace)
  await ready()
  await expect.poll(async () => (await guestScript(read))?.elements.length).toBe(0)
  await page.evaluate(workspace => window.__excalidrawCheck = import('/src/store/session.ts').then(module => module.setCurrentCwd(workspace)), originalWorkspace)
  await ready()
  await expect.poll(async () => (await guestScript(read))?.elements[0]?.id).toBe(saved.elements[0].id)
  checks.push('Real host workspace switching isolated and restored drawings')
  await page.reload()
  await ready()
  expect((await guestScript(read)).elements[0].id).toBe(saved.elements[0].id)
  checks.push('Renderer reload restored the open pane and drawing')
  await page.screenshot({ path: join(root, 'desktop.png') })
  await app.close()
  app = null
  page = await launch()
  await ready()
  expect((await guestScript(read)).elements[0].id).toBe(saved.elements[0].id)
  checks.push('Full Electron restart restored the open pane and drawing')
  const width = await page.locator('webview[aria-label="Excalidraw editor"]').evaluate(element => element.clientWidth)
  await expect.poll(async () => Math.abs(await guestScript('innerWidth') - width)).toBeLessThanOrEqual(1)
  expect(await guestScript('document.querySelector("[data-testid=main-menu-trigger]").getBoundingClientRect().bottom <= innerHeight')).toBe(true)
  checks.push('Native guest viewport matches pane bounds and keeps its menu visible')
  const png = await app.evaluate(async ({ webContents }) => (await webContents.getAllWebContents().find(view => view.getType() === 'webview').capturePage()).toPNG().toString('base64'))
  await writeFile(join(root, 'editor.png'), Buffer.from(png, 'base64'))
  await writeFile(join(root, 'verification.json'), JSON.stringify({ checks, install, pluginBackend: 'none' }, null, 2))
  console.log(JSON.stringify({ checks, artifacts: root }, null, 2))
} finally {
  if (app) {
    const page = app.windows().find(page => page.url().startsWith(env.HERMES_DESKTOP_DEV_SERVER))
    await page?.screenshot({ path: join(root, 'desktop.png') })
    console.log(`Desktop screenshot: ${join(root, 'desktop.png')}`)
    await app.close()
  }
  if (backend.pid) {
    try { process.kill(-backend.pid, 'SIGTERM') } catch (error) { if (error.code !== 'ESRCH') throw error }
  }
}
