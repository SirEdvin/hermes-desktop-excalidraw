import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const editorUrl = pathToFileURL(resolve('../editor.html')).href
const element = { id: 'agent-box', type: 'rectangle', x: 100, y: 100, width: 200, height: 80 }
const drawing = elements => JSON.stringify({ type: 'excalidraw', version: 2, elements, appState: { viewBackgroundColor: '#ffffff' }, files: {} })
async function request(page, action, data = {}) {
  return page.evaluate(({ action, data }) => window.hermesDrawingHandoff({ version: 1, scope: location.hash.slice(1), id: crypto.randomUUID(), action, ...data }), { action, data })
}
async function snapshot(page) {
  const result = await request(page, 'snapshot')
  expect(result.ok, result.error).toBe(true)
  return result.result.raw
}
async function preview(page, raw) {
  const result = await request(page, 'preview', { raw })
  expect(result.ok, result.error).toBe(true)
  return result.result
}
async function draw(page) {
  await page.getByTestId('toolbar-rectangle').locator('..').click()
  await page.mouse.move(600, 350)
  await page.mouse.down()
  await page.mouse.move(750, 450)
  await page.mouse.up()
}
test.beforeEach(async ({ page, context }) => {
  await context.setOffline(true)
  await page.goto(`${editorUrl}#test-scope`)
  await page.waitForFunction(() => typeof window.hermesDrawingHandoff === 'function')
})

test('preview does not mutate; explicit apply saves and provides recovery download', async ({ page }) => {
  const initial = await snapshot(page)
  const result = await preview(page, drawing([element]))
  expect(result.image).toMatch(/^data:image\/png;base64,/)
  expect(await snapshot(page)).toBe(initial)
  expect((await request(page, 'apply', { previewId: result.previewId })).ok).toBe(true)
  await expect.poll(async () => JSON.parse(await snapshot(page)).elements[0]?.id).toBe(element.id)
  const download = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Download drawing before last agent result' }).click()
  expect(await readFile(await (await download).path(), 'utf8')).toBe(initial)
  await page.reload()
  await page.waitForFunction(() => typeof window.hermesDrawingHandoff === 'function')
  expect(JSON.parse(await snapshot(page)).elements[0].id).toBe(element.id)
  await expect(page.getByRole('link', { name: 'Download drawing before last agent result' })).toBeVisible()
})

test('stale scope, malformed messages, replay and late edits cannot replace a drawing', async ({ page }) => {
  const initial = await snapshot(page)
  for (const data of [{ scope: 'different' }, { version: 2 }, { id: null }]) {
    expect((await request(page, 'snapshot', data)).ok).toBe(false)
  }
  expect((await request(page, 'execute', { raw: 'alert(1)' })).ok).toBe(false)
  const result = await preview(page, drawing([element]))
  await draw(page)
  const changed = await snapshot(page)
  expect(changed).not.toBe(initial)
  const rejected = await request(page, 'apply', { previewId: result.previewId })
  expect(rejected.ok).toBe(false)
  expect(rejected.error).toContain('changed after preview')
  expect(await snapshot(page)).toBe(changed)
  const fresh = await preview(page, drawing([element]))
  expect((await request(page, 'apply', { previewId: fresh.previewId })).ok).toBe(true)
  expect((await request(page, 'apply', { previewId: fresh.previewId })).ok).toBe(false)
})

test('bad result and unavailable recovery storage preserve canvas and last saved data', async ({ page }) => {
  await draw(page)
  const before = await snapshot(page)
  for (const raw of ['{', drawing([{ ...element, x: null }]), drawing([{ ...element, type: 'embeddable', link: 'https://example.com' }]), ' '.repeat(524289)]) {
    expect((await request(page, 'preview', { raw })).ok).toBe(false)
    expect(await snapshot(page)).toBe(before)
  }
  const result = await preview(page, drawing([element]))
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError') } })
  expect((await request(page, 'apply', { previewId: result.previewId })).ok).toBe(false)
  expect(await snapshot(page)).toBe(before)
  expect(await page.evaluate(() => localStorage.getItem('hermes.excalidraw.scene:test-scope'))).toBe(before)
})

test('failed scene save after successful backup leaves the canvas unchanged', async ({ page }) => {
  await draw(page)
  const before = await snapshot(page)
  const result = await preview(page, drawing([element]))
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function(key, value) {
      if (key === 'hermes.excalidraw.scene:test-scope') throw new DOMException('Full', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  expect((await request(page, 'apply', { previewId: result.previewId })).ok).toBe(false)
  expect(await snapshot(page)).toBe(before)
  expect(await page.evaluate(() => localStorage.getItem('hermes.excalidraw.scene:test-scope'))).toBe(before)
  expect(await page.evaluate(() => localStorage.getItem('hermes.excalidraw.scene:test-scope:before-agent'))).toBe(before)
})

test('shape, text, arrow and embedded raster survive the real editor', async ({ page }) => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg=='
  const raw = JSON.stringify({ type: 'excalidraw', elements: [element,
    { id: 'text', type: 'text', x: 120, y: 120, width: 160, height: 25, text: 'Hello forest', fontSize: 20, fontFamily: 1 },
    { id: 'arrow', type: 'arrow', x: 300, y: 140, width: 100, height: 0, points: [[0, 0], [100, 0]], endArrowhead: 'arrow' },
    { id: 'image', type: 'image', x: 420, y: 100, width: 80, height: 80, fileId: 'pixel', scale: [1, 1], status: 'saved' }
  ], files: { pixel: { id: 'pixel', mimeType: 'image/png', dataURL: png, created: 1 } }, appState: {} })
  const result = await preview(page, raw)
  expect(result.count).toBe(4)
  expect((await request(page, 'apply', { previewId: result.previewId })).ok).toBe(true)
  await expect.poll(async () => JSON.parse(await snapshot(page)).elements.length).toBe(4)
  const saved = JSON.parse(await snapshot(page))
  expect(saved.elements.map(element => element.type)).toEqual(['rectangle', 'text', 'arrow', 'image'])
  expect(saved.files.pixel.dataURL).toBe(png)
  await page.reload()
  await page.waitForFunction(() => typeof window.hermesDrawingHandoff === 'function')
  expect(JSON.parse(await snapshot(page)).elements.length).toBe(4)
})
