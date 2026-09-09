import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const editorUrl = pathToFileURL(resolve('../editor.html')).href
const key = scope => `hermes.excalidraw.scene:${scope}`

async function open(page, scope = 'a') {
  await page.goto('about:blank')
  await page.goto(`${editorUrl}#${scope}`)
  await expect(page.getByTestId('toolbar-rectangle')).toBeVisible()
}

async function draw(page) {
  await page.getByTestId('toolbar-rectangle').locator('..').click()
  const bounds = await page.locator('main').boundingBox()
  await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.45)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + bounds.height * 0.65, { steps: 4 })
  await page.mouse.up()
}

async function scene(page, scope = 'a') {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), key(scope))
}

async function menu(page) {
  await page.getByTestId('main-menu-trigger').click()
}

test.beforeEach(async ({ page, context }) => {
  await context.setOffline(true)
  await page.addInitScript(() => {
    // Exercise ordinary file import/download instead of browser picker automation.
    delete window.showOpenFilePicker
    delete window.showSaveFilePicker
  })
})

test('offline drawing survives reload and workspace switching without a bridge', async ({ page }) => {
  const network = []
  const errors = []
  page.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()) })
  page.on('pageerror', error => errors.push(error.message))
  await open(page)
  await draw(page)
  await expect.poll(async () => (await scene(page)).elements.length).toBe(1)
  const saved = await scene(page)
  const restored = saved.elements.map(element => ({ ...element, boundElements: element.boundElements || [] }))
  await page.reload()
  await expect(page.getByTestId('toolbar-rectangle')).toBeVisible()
  expect((await scene(page)).elements).toEqual(restored)
  await open(page, 'b')
  await expect.poll(async () => (await scene(page, 'b'))?.elements.length).toBe(0)
  await draw(page)
  await open(page, 'a')
  expect((await scene(page)).elements).toEqual(restored)
  expect(await page.evaluate(() => typeof window.hermesExcalidraw)).toBe('undefined')
  expect(network).toEqual([])
  expect(errors).toEqual([])
})

test('native menu exports and imports a real Excalidraw file', async ({ page }) => {
  await open(page)
  await draw(page)
  const saved = await scene(page)
  await menu(page)
  await page.getByTestId('json-export-button').click()
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save to file' }).click()
  const download = await downloadEvent
  const contents = await readFile(await download.path(), 'utf8')
  expect(JSON.parse(contents).elements).toEqual(saved.elements)
  expect(download.suggestedFilename()).toMatch(/\.excalidraw$/)
  await open(page, 'imported')
  await menu(page)
  const chooserEvent = page.waitForEvent('filechooser')
  await page.getByText('Open', { exact: true }).click()
  await (await chooserEvent).setFiles({ name: 'drawing.excalidraw', mimeType: 'application/json', buffer: Buffer.from(contents) })
  await expect.poll(async () => (await scene(page, 'imported'))?.elements.length).toBe(1)
  expect((await scene(page, 'imported')).elements[0].id).toBe(saved.elements[0].id)
})

test('native image export downloads a PNG', async ({ page }) => {
  await open(page)
  await draw(page)
  await menu(page)
  await page.getByTestId('image-export-button').click()
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export to PNG', exact: true }).click()
  const download = await downloadEvent
  const png = await readFile(await download.path())
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  expect(download.suggestedFilename()).toMatch(/\.png$/)
})

test('storage failure warns without replacing the last saved drawing', async ({ page }) => {
  await open(page)
  await draw(page)
  const saved = await scene(page)
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError') }
  })
  await draw(page)
  await expect(page.getByRole('alert')).toContainText('Local save failed')
  expect(await scene(page)).toEqual(saved)
  // File export remains reachable even when autosave is unavailable.
  await menu(page)
  await expect(page.getByTestId('json-export-button')).toBeVisible()
})

for (const damaged of ['{broken json', 'null', '{"type":"excalidraw","elements":{}}']) {
  test(`damaged local data is preserved until explicit reset: ${damaged}`, async ({ page }) => {
    await page.goto(editorUrl)
    await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: key('damaged'), raw: damaged })
    await page.goto('about:blank')
    await page.goto(`${editorUrl}#damaged`)
    await expect(page.getByRole('alert')).toContainText('has not been overwritten')
    expect(await page.evaluate(key => localStorage.getItem(key), key('damaged'))).toBe(damaged)
    const downloadEvent = page.waitForEvent('download')
    await page.getByRole('link', { name: 'Download recovery data' }).click()
    expect(await readFile(await (await downloadEvent).path(), 'utf8')).toBe(damaged)
    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Start empty canvas' }).click()
    await expect(page.getByTestId('toolbar-rectangle')).toBeVisible()
    await expect.poll(async () => (await scene(page, 'damaged'))?.elements.length).toBe(0)
  })
}

test('canvas resizes in narrow and wide panes, in light and dark mode', async ({ page }) => {
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme })
    await open(page, colorScheme)
    await expect(page.locator('.excalidraw')).toHaveClass(colorScheme === 'dark' ? /theme--dark/ : /excalidraw/)
    for (const width of [400, 1100]) {
      await page.setViewportSize({ width, height: 700 })
      await expect.poll(async () => Math.round((await page.locator('main').boundingBox()).width)).toBe(width)
      const canvas = await page.locator('canvas').first().boundingBox()
      expect(canvas.width).toBe(width)
      expect(canvas.height).toBeLessThanOrEqual(700)
    }
  }
})
