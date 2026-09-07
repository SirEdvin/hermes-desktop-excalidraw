import { build } from 'esbuild'
import { copyFile, readFile, stat } from 'node:fs/promises'

const editor = await readFile('dist/editor.html', 'utf8')
if (/AIza[0-9A-Za-z_-]{35}|excalidraw-room-persistence/.test(editor)) {
  throw new Error('Offline editor contains upstream Google/Firebase configuration; refusing to publish')
}
await copyFile('dist/editor.html', '../editor.html')

await build({
  entryPoints: ['../src/plugin.jsx'],
  outfile: '../plugin.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'chrome120',
  jsx: 'automatic',
  external: ['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'],
  legalComments: 'none'
})

if ((await stat('../plugin.js')).size >= 16 * 1024 * 1024) {
  throw new Error('Desktop plugin exceeds the Hermes 16 MiB source limit')
}
