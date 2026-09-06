import { expect, test } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const url = pathToFileURL(path.resolve('dist/editor.html')).href
const empty = { type: 'excalidraw', version: 2, elements: [], appState: {}, files: {} }

async function open(page, scope) {
  await page.goto('about:blank')
  await page.goto(`${url}#${scope}`)
  await page.waitForFunction(() => window.hermesExcalidraw)
  // The draft restore runs before the readiness console event.
  await page.waitForTimeout(100)
}

async function draw(page, x = 500) {
  await page.locator('[data-testid="toolbar-rectangle"]').check({ force: true })
  await page.mouse.move(x, 350)
  await page.mouse.down()
  await page.mouse.move(x + 100, 430, { steps: 4 })
  await page.mouse.up()
  await expect.poll(() => page.evaluate(() => window.hermesExcalidraw.state().dirty)).toBe(true)
}

const state = page => page.evaluate(() => window.hermesExcalidraw.state())

test('failed-save draft survives workspace switches and restart, never a remote overwrite', async ({ page }) => {
  await open(page, 'workspace-a')
  await page.evaluate(scene => window.hermesExcalidraw.loadScene(scene, 'revision-a'), empty)
  await draw(page)
  const before = await state(page)
  expect(before.scene.elements).toHaveLength(1)
  expect(await page.evaluate(scene => window.hermesExcalidraw.loadScene(scene, 'agent-revision'), empty)).toBe(false)
  expect((await state(page)).scene).toEqual(before.scene)

  await open(page, 'workspace-b')
  expect((await state(page)).dirty).toBe(false)
  await open(page, 'workspace-a')
  expect((await state(page)).dirty).toBe(true)
  expect((await state(page)).scene.elements[0].id).toBe(before.scene.elements[0].id)
  expect((await state(page)).revision).toBe('revision-a')

  await page.evaluate(scene => window.hermesExcalidraw.loadScene(scene, 'agent-revision', true), empty)
  await page.reload()
  await page.waitForFunction(() => window.hermesExcalidraw)
  expect((await state(page)).dirty).toBe(false)
})

test('save acknowledgement retains edits made in flight and advances their base revision', async ({ page }) => {
  await open(page, 'in-flight')
  await page.evaluate(scene => window.hermesExcalidraw.loadScene(scene, 'initial'), empty)
  await draw(page)
  const first = await state(page)
  await draw(page, 700)
  await page.evaluate(g => window.hermesExcalidraw.saved(g, 'saved-first'), first.generation)
  const second = await state(page)
  expect(second.dirty).toBe(true)
  expect(second.revision).toBe('saved-first')
  expect(second.scene.elements).toHaveLength(2)
  await page.reload()
  await page.waitForFunction(() => window.hermesExcalidraw?.state().dirty)
  expect((await state(page)).scene.elements).toHaveLength(2)
  const restored = await state(page)
  await page.evaluate(g => window.hermesExcalidraw.saved(g, 'saved-second'), restored.generation)
  expect((await state(page)).dirty).toBe(false)
})

test('first edit of an existing element is captured after remote load; load itself stays clean', async ({ page }) => {
  await open(page, 'existing-element')
  const scene = { ...empty, elements: [{ id: 'box', type: 'rectangle', x: 500, y: 350, width: 100, height: 80 }] }
  await page.evaluate(scene => window.hermesExcalidraw.loadScene(scene, 'remote'), scene)
  expect((await state(page)).dirty).toBe(false)
  await page.mouse.click(550, 350)
  await page.keyboard.press('Delete')
  await expect.poll(async () => (await state(page)).scene.elements.length).toBe(0)
  expect((await state(page)).dirty).toBe(true)
})

test('local storage failure is reported and does not discard the in-memory scene', async ({ page }) => {
  await open(page, 'quota')
  await page.evaluate(scene => {
    window.hermesExcalidraw.loadScene(scene, 'initial')
    Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError') }
  }, empty)
  await draw(page)
  const current = await state(page)
  expect(current.storageError).toBe(true)
  expect(current.dirty).toBe(true)
  expect(current.scene.elements).toHaveLength(1)
})
