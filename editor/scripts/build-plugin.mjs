import { build } from 'esbuild'
import { copyFile, stat } from 'node:fs/promises'

await copyFile('dist/editor.html', '../desktop/editor.html')

await build({
  entryPoints: ['../desktop/src/plugin.jsx'],
  outfile: '../desktop/plugin.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'chrome120',
  jsx: 'automatic',
  external: ['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'],
  legalComments: 'none'
})

if ((await stat('../desktop/plugin.js')).size >= 16 * 1024 * 1024) {
  throw new Error('Desktop plugin exceeds the Hermes 16 MiB source limit')
}
