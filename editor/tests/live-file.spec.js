import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

let url
const box = { id: 'box', type: 'rectangle', x: 0, y: 0, width: 100, height: 80 }
const drawing = elements => JSON.stringify({ type: 'excalidraw', elements, appState: {}, files: {} })
test.beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'excalidraw-live-ui-'))
  await build({ entryPoints: [resolve('tests/fixtures/live-file.jsx')], outfile: join(directory, 'fixture.js'), bundle: true, jsx: 'automatic', nodePaths: [resolve('node_modules')], plugins: [{
    name: 'sdk-fixture', setup(build) {
      build.onResolve({ filter: /^@hermes\/plugin-sdk$/ }, () => ({ path: 'sdk', namespace: 'fixture' }))
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `import React from 'react'; export const Button = React.forwardRef(({variant,size,...props},ref) => React.createElement('button',{...props,ref})); export {useQuery} from '@tanstack/react-query';`, resolveDir: resolve('.') }))
    }
  }] })
  await writeFile(join(directory, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><style>:root{color-scheme:light dark;--ui-text-primary:CanvasText;--ui-text-secondary:CanvasText;--ui-stroke-secondary:GrayText;--ui-accent:Highlight}body{margin:0;background:Canvas;color:CanvasText;font-family:system-ui}#root{height:700px;display:flex;flex-direction:column}button{font:inherit;color:inherit;background:Canvas}</style></head><body><div id="root"></div><script src="fixture.js"></script></body></html>')
  url = pathToFileURL(join(directory, 'index.html')).href
})
test.beforeEach(async ({ page, context }) => {
  await context.setOffline(true)
  await page.goto(url)
})
async function open(page) {
  await page.evaluate(raw => { window.fixture.raw = raw }, drawing([box]))
  await page.getByRole('button', { name: 'Open live file' }).click()
  await expect(page.getByRole('img', { name: 'Live Excalidraw drawing' })).toBeVisible()
}
const renders = page => page.evaluate(() => window.fixture.renders)

test('open once, automatic refresh, unchanged skip, empty drawing and no writes', async ({ page }) => {
  await open(page)
  expect(await page.evaluate(() => window.fixture.options)).toMatchObject({ defaultPath: '/project', directories: false, multiple: false })
  const initial = await renders(page)
  await expect.poll(() => page.evaluate(() => window.fixture.reads)).toBeGreaterThan(1)
  expect(await renders(page)).toBe(initial)
  await page.evaluate(raw => { window.fixture.raw = raw }, drawing([box, { ...box, id: 'other' }]))
  await expect(page.getByRole('status')).toContainText('2 elements')
  await page.evaluate(raw => { window.fixture.raw = raw }, drawing([]))
  await expect(page.getByText('Empty drawing', { exact: true })).toBeVisible()
  await expect(page.getByRole('img')).toHaveCount(0)
  expect(await page.evaluate(() => window.fixture.writes)).toBe(0)
  await page.getByRole('button', { name: 'Return to editor' }).click()
  await expect(page.getByText('Manual drawing untouched')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open live file' })).toBeFocused()
  const reads = await page.evaluate(() => window.fixture.reads)
  await page.waitForTimeout(2300)
  expect(await page.evaluate(() => window.fixture.reads)).toBe(reads)
})

test('last valid image survives read/validation/render failures and recovers automatically', async ({ page }) => {
  await open(page)
  for (const failure of ['partial', 'missing', 'truncated', 'oversize', 'binary', 'renderFailure']) {
    await page.evaluate(({ failure, raw }) => {
      const f = window.fixture
      f.raw = failure === 'partial' ? '{' : failure === 'oversize' ? ' '.repeat(524289) : raw
      if (!['partial', 'oversize'].includes(failure)) f[failure] = true
    }, { failure, raw: drawing([{ ...box, width: 120 }]) })
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('img')).toBeVisible()
    await page.evaluate(({ failure, raw }) => { window.fixture[failure] = false; window.fixture.raw = raw }, { failure, raw: drawing([box]) })
    await expect(page.getByRole('alert')).toHaveCount(0)
  }
})

test('picker cancellation, storage error, keyboard and scoped reopen', async ({ page }) => {
  await page.getByRole('button', { name: 'Open live file' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Empty drawing', { exact: true })).toBeVisible()
  await page.evaluate(() => { window.fixture.cancel = true })
  await page.getByRole('button', { name: 'Open live file' }).click()
  await expect(page.getByText('Empty drawing', { exact: true })).toBeVisible()
  await page.evaluate(() => window.fixture.mount('b'))
  await expect(page.getByText('Manual drawing untouched')).toBeVisible()
  await page.evaluate(() => window.fixture.mount('a'))
  await expect(page.getByText('Empty drawing', { exact: true })).toBeVisible()
  await page.evaluate(() => { window.fixture.storageFailure = true })
  await page.getByRole('button', { name: 'Return to editor' }).click()
  await expect(page.getByRole('alert')).toContainText('remember')
  await expect(page.getByText('Manual drawing untouched')).toBeVisible()
})

for (const phase of ['Read', 'Render', 'Picker']) test(`late ${phase.toLowerCase()} is discarded after scope change`, async ({ page }) => {
  await page.evaluate(phase => { window.fixture['delay' + phase] = true }, phase)
  await page.getByRole('button', { name: 'Open live file' }).click()
  await page.waitForFunction(phase => window.fixture['release' + phase], phase)
  await page.evaluate(() => window.fixture.mount('b'))
  await expect(page.getByText('Manual drawing untouched')).toBeVisible()
  await page.evaluate(phase => window.fixture['release' + phase](), phase)
  await expect(page.getByRole('img')).toHaveCount(0)
  await expect(page.getByText('Empty drawing', { exact: true })).toHaveCount(0)
  const reads = await page.evaluate(() => window.fixture.reads)
  await page.waitForTimeout(2300)
  expect(await page.evaluate(() => window.fixture.reads)).toBe(reads)
})

test('missing APIs and responsive read-only controls', async ({ page }) => {
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.evaluate(() => { window.hermesDesktop.readFileText = null })
  await page.getByRole('button', { name: 'Open live file' }).click()
  await expect(page.getByRole('alert')).toContainText('Update Hermes Desktop')
  await page.reload()
  await open(page)
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme })
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 700 })
      expect(await page.locator('.hx-file-panel').evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true)
      const image = await page.getByRole('img').boundingBox()
      expect(image.x).toBeGreaterThanOrEqual(0)
      expect(image.x + image.width).toBeLessThanOrEqual(width)
      await expect(page.getByRole('button', { name: 'Return to editor' })).toBeVisible()
    }
  }
  expect(errors).toEqual([])
})

test('failed rendering retries unchanged bytes and file switches never reuse the old image', async ({ page }) => {
  await open(page)
  await page.evaluate(raw => { window.fixture.raw = raw; window.fixture.renderFailure = true }, drawing([box, { ...box, id: 'second' }]))
  await expect(page.getByRole('alert')).toContainText('Rendering failed')
  await page.evaluate(() => { window.fixture.renderFailure = false })
  await expect(page.getByRole('status')).toContainText('2 elements')
  await page.evaluate(() => { window.fixture.path = '/project/another.excalidraw'; window.fixture.missing = true })
  await page.getByRole('button', { name: 'Open live file' }).click()
  await expect(page.locator('.hx-live-path')).toHaveText('/project/another.excalidraw')
  await expect(page.getByRole('img')).toHaveCount(0)
  await expect(page.getByRole('alert')).toContainText('File not found')
  await page.evaluate(() => { window.fixture.missing = false })
  await expect(page.getByRole('img')).toBeVisible()
})

test('slow reads and renders do not overlap and pane closure stops polling', async ({ page }) => {
  await page.evaluate(raw => { Object.assign(window.fixture, { raw, delayRead: true, delayRender: true }) }, drawing([box]))
  await page.getByRole('button', { name: 'Open live file' }).click()
  await page.waitForFunction(() => window.fixture.releaseRead)
  await page.waitForTimeout(2300)
  expect(await page.evaluate(() => window.fixture.reads)).toBe(1)
  await page.evaluate(() => { window.fixture.delayRead = false; window.fixture.releaseRead() })
  await page.waitForFunction(() => window.fixture.releaseRender)
  await page.waitForTimeout(2300)
  expect(await page.evaluate(() => [window.fixture.reads, window.fixture.renders])).toEqual([1, 1])
  await page.evaluate(() => { window.fixture.delayRender = false; window.fixture.releaseRender() })
  await expect(page.getByRole('img')).toBeVisible()
  await page.evaluate(() => window.fixture.mount('a', false))
  await expect(page.locator('.hx-file-panel')).toHaveCount(0)
  const reads = await page.evaluate(() => window.fixture.reads)
  await page.waitForTimeout(2300)
  expect(await page.evaluate(() => window.fixture.reads)).toBe(reads)
  await page.evaluate(() => window.fixture.mount('a'))
  await expect(page.getByRole('img')).toBeVisible()
})
