import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

let url
// UI contract tests use explicit native/SDK doubles; verify-desktop.mjs uses the real host.
test.beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'excalidraw-panel-'))
  await build({ entryPoints: [resolve('tests/fixtures/panel.jsx')], outfile: join(directory, 'panel.js'), bundle: true, jsx: 'automatic', nodePaths: [resolve('node_modules')], plugins: [{
    name: 'sdk-test-double', setup(build) {
      build.onResolve({ filter: /^@hermes\/plugin-sdk$/ }, () => ({ path: 'sdk', namespace: 'fixture' }))
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `import React from 'react'; export const Button = ({variant, size, ...props}) => React.createElement('button', props); export const Textarea = props => React.createElement('textarea', props);`, resolveDir: resolve('.') }))
    }
  }] })
  await writeFile(join(directory, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><title>Handoff UI test</title><style>:root{color-scheme:light dark;--ui-text-primary:CanvasText;--ui-text-secondary:CanvasText;--ui-stroke-secondary:GrayText;--ui-accent:Highlight}body{margin:0;background:Canvas;color:CanvasText;font-family:system-ui}#root{height:700px;display:flex;flex-direction:column}button,textarea{color:inherit;background:Canvas;font:inherit}textarea{box-sizing:border-box;width:100%}</style></head><body><div id="root"></div><script src="panel.js"></script></body></html>')
  url = pathToFileURL(join(directory, 'index.html')).href
})
test.beforeEach(async ({ page, context }) => {
  await context.setOffline(true)
  await page.goto(url)
  await page.locator('.hx-handoff > summary').click()
})
async function prepare(page) {
  await page.getByRole('button', { name: 'Choose folder' }).click()
  await page.getByRole('button', { name: 'Prepare handoff' }).click()
  await expect(page.getByRole('status')).toContainText('Input file verified')
}
async function output(page) {
  await page.evaluate(() => {
    const handoff = window.fixture.metadata.get(`handoff:${window.fixture.scope}`)
    window.fixture.entries.set(handoff.output, window.fixture.raw)
  })
}

test('keyboard workflow, clipboard fallback and explicit conflict consent', async ({ page }) => {
  await page.getByRole('button', { name: 'Choose folder' }).focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Prepare handoff' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status')).toContainText('Input file verified')
  await page.evaluate(() => { window.fixture.clipboardFailure = true })
  await page.getByRole('button', { name: 'Copy agent instructions' }).click()
  await expect(page.getByRole('alert')).toContainText('Select and copy')
  await page.getByText('View instructions', { exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Agent instructions' })).toContainText('My drawing request')
  await page.evaluate(() => { window.fixture.clipboardFailure = false; window.fixture.changed = true })
  await page.getByRole('button', { name: 'Copy agent instructions' }).click()
  await expect(page.getByRole('status')).toContainText('Nothing was sent automatically')
  await output(page)
  await page.getByRole('button', { name: 'Read result' }).click()
  await expect(page.getByRole('button', { name: 'Apply result' })).toBeDisabled()
  expect(await page.evaluate(() => window.fixture.applied)).toBe(0)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Apply result' }).click()
  await expect(page.getByRole('status')).toContainText('Result applied')
  expect(await page.evaluate(() => window.fixture.applied)).toBe(1)
})

test('late reads and metadata are isolated across profile/workspace scopes', async ({ page }) => {
  await prepare(page)
  await output(page)
  await page.evaluate(() => { window.fixture.delay = true })
  await page.getByRole('button', { name: 'Read result' }).click()
  await page.waitForFunction(() => window.fixture.release)
  await page.evaluate(() => window.fixture.mount('other-profile/other-workspace'))
  await page.evaluate(() => window.fixture.release())
  await expect(page.locator('.hx-handoff')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Apply result' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Read result' })).toHaveCount(0)
  await page.evaluate(() => window.fixture.mount('a'))
  await page.locator('.hx-handoff > summary').click()
  await expect(page.getByRole('button', { name: 'Read result' })).toBeVisible()
})

test('missing API and missing output show actionable errors', async ({ page }) => {
  await page.evaluate(() => { window.hermesDesktop.writeTextFile = null })
  await page.getByRole('button', { name: 'Choose folder' }).click()
  await expect(page.getByRole('alert')).toContainText('Update Hermes Desktop')
  await page.reload()
  await page.locator('.hx-handoff > summary').click()
  await prepare(page)
  await page.getByRole('button', { name: 'Read result' }).click()
  await expect(page.getByRole('alert')).toContainText('Wait for the agent')
})

test('handoff panel wraps at narrow and wide widths in both color schemes', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await prepare(page)
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme })
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 700 })
      const panel = page.locator('.hx-handoff')
      expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      for (const name of ['Choose folder', 'Prepare handoff', 'Copy agent instructions', 'Read result']) {
        const button = page.getByRole('button', { name })
        await button.scrollIntoViewIfNeeded()
        const box = await button.boundingBox()
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(width)
      }
    }
  }
  expect(errors).toEqual([])
})
