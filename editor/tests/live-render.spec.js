import { test, expect } from '@playwright/test'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const url = pathToFileURL(resolve('../editor.html')).href + '#live-test'
const scene = elements => JSON.stringify({ type: 'excalidraw', elements, files: {}, appState: {} })
const box = { id: 'box', type: 'rectangle', x: 0, y: 0, width: 100, height: 80 }
const request = (page, action, data = {}) => page.evaluate(({ action, data }) => window.hermesDrawingHandoff({ version: 1, id: crypto.randomUUID(), scope: location.hash.slice(1), action, ...data }), { action, data })

test('render-only refresh does not change manual drawing or stage an apply', async ({ page, context }) => {
  await context.setOffline(true)
  await page.goto(url)
  await page.waitForFunction(() => typeof window.hermesDrawingHandoff === 'function')
  const before = (await request(page, 'snapshot')).result.raw
  const rendered = await request(page, 'render', { raw: scene([box]) })
  expect(rendered.ok, rendered.error).toBe(true)
  expect(rendered.result.image).toMatch(/^data:image\/png;base64,/)
  expect((await request(page, 'snapshot')).result.raw).toBe(before)
  expect((await request(page, 'apply', { previewId: rendered.id })).ok).toBe(false)
  expect((await request(page, 'render', { raw: scene([]) })).result).toEqual({ image: null, count: 0 })
  for (const data of [{ raw: '{' }, { raw: scene([{ ...box, x: null }]) }, { raw: scene([box]), scope: 'other' }, { raw: scene([box]), version: 2 }]) {
    expect((await request(page, 'render', data)).ok).toBe(false)
  }
  expect((await request(page, 'snapshot')).result.raw).toBe(before)
})

test('a damaged manual drawing cannot block independent rendering', async ({ page, context }) => {
  await context.setOffline(true)
  await page.addInitScript(() => localStorage.setItem('hermes.excalidraw.scene:live-test', '{broken'))
  await page.goto(url)
  await expect(page.getByRole('alert')).toContainText('could not be read')
  await page.waitForFunction(() => typeof window.hermesDrawingHandoff === 'function')
  const result = await request(page, 'render', { raw: scene([box]) })
  expect(result.ok, result.error).toBe(true)
  expect(result.result.image).toMatch(/^data:image\/png;base64,/)
  expect(await page.evaluate(() => localStorage.getItem('hermes.excalidraw.scene:live-test'))).toBe('{broken')
})

test('render handles real text, arrows and raster data without executing scene text', async ({ page }) => {
  await page.goto(url)
  await page.waitForFunction(() => typeof window.hermesDrawingHandoff === 'function')
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg=='
  const raw = JSON.stringify({ type: 'excalidraw', elements: [box,
    { id: 'text', type: 'text', x: 10, y: 100, width: 400, height: 25, text: '</script>;window.pwned=true', fontSize: 20, fontFamily: 1 },
    { id: 'arrow', type: 'arrow', x: 100, y: 40, width: 100, height: 0, points: [[0, 0], [100, 0]], endArrowhead: 'arrow' },
    { id: 'image', type: 'image', x: 220, y: 0, width: 80, height: 80, fileId: 'pixel', scale: [1, 1], status: 'saved' }
  ], files: { pixel: { id: 'pixel', mimeType: 'image/png', dataURL: png, created: 1 } }, appState: {} })
  const result = await request(page, 'render', { raw })
  expect(result.ok, result.error).toBe(true)
  expect(result.result.count).toBe(4)
  expect(result.result.image).toMatch(/^data:image\/png;base64,/)
  expect(await page.evaluate(() => window.pwned)).toBeUndefined()
  expect((await request(page, 'render', { raw: scene([{ ...box, type: 'embeddable', link: 'https://example.com' }]) })).ok).toBe(false)
})
