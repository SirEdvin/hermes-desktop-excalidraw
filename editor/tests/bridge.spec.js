import { expect, test } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const editorUrl = pathToFileURL(path.resolve('dist/editor.html')).href

const scene = {
  type: 'excalidraw',
  version: 2,
  source: 'browser-test',
  elements: [
    {
      id: 'box',
      type: 'rectangle',
      x: 20,
      y: 20,
      width: 120,
      height: 80,
      angle: 0,
      strokeColor: '#1e1e1e',
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      index: 'a0',
      roundness: null,
      seed: 1,
      version: 1,
      versionNonce: 1,
      isDeleted: false,
      boundElements: null,
      updated: 1,
      link: null,
      locked: false
    }
  ],
  appState: {},
  files: {}
}

test('offline editor exposes a narrow load/snapshot bridge', async ({ page }) => {
  await page.context().setOffline(true)
  const externalRequests = []
  const bridgeMessages = []
  page.on('request', request => {
    if (/^https?:/.test(request.url())) externalRequests.push(request.url())
  })
  page.on('console', message => {
    if (message.text().startsWith('HERMES_EXCALIDRAW:')) bridgeMessages.push(message.text())
  })

  await page.goto(editorUrl)
  await page.waitForFunction(() => window.hermesExcalidraw)

  const result = await page.evaluate(async input => {
    const keys = Object.keys(window.hermesExcalidraw).sort()
    const empty = window.hermesExcalidraw.snapshot()
    const loaded = await window.hermesExcalidraw.loadScene(input)
    await new Promise(resolve => setTimeout(resolve, 150))
    return { keys, empty, loaded, scene: window.hermesExcalidraw.snapshot() }
  }, scene)

  expect(result.keys).toEqual(['loadScene', 'saved', 'snapshot', 'state'])
  expect(result.empty.elements).toEqual([])
  expect(result.loaded).toBe(true)
  expect(result.scene.elements).toHaveLength(1)
  expect(result.scene.elements[0].id).toBe('box')
  expect(bridgeMessages).not.toContain('HERMES_EXCALIDRAW:{"type":"changed"}')
  expect(externalRequests).toEqual([])
  await expect(page.locator('main[aria-label="Excalidraw canvas"]')).toBeVisible()
})

test('editor announces readiness and user changes without serializing scenes to console', async ({ page }) => {
  const bridgeMessages = []
  page.on('console', message => {
    if (message.text().startsWith('HERMES_EXCALIDRAW:')) bridgeMessages.push(message.text())
  })

  await page.goto(editorUrl)
  await page.waitForFunction(() => window.hermesExcalidraw)
  await expect.poll(() => bridgeMessages).toContain('HERMES_EXCALIDRAW:{"type":"ready"}')
  await page.evaluate(() => window.hermesExcalidraw.loadScene({ elements: [] }, 'initial'))

  const rectangle = page.locator('[data-testid="toolbar-rectangle"]')
  await expect(rectangle).toBeVisible()
  await rectangle.check({ force: true })
  const canvas = page.locator('canvas').last()
  const bounds = await canvas.boundingBox()
  await page.mouse.move(bounds.x + 640, bounds.y + 360)
  await page.mouse.down()
  await page.mouse.move(bounds.x + 760, bounds.y + 440, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(300)

  expect(bridgeMessages).toContain('HERMES_EXCALIDRAW:{"type":"changed"}')
  expect(bridgeMessages.every(message => message.length < 80)).toBe(true)
  const exported = await page.evaluate(() => window.hermesExcalidraw.snapshot())
  expect(exported.elements.some(element => element.type === 'rectangle')).toBe(true)
})
