import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

let embeddedFonts = 0
const embedExcalidrawFonts = {
  name: 'embed-excalidraw-fonts',
  enforce: 'pre',
  transform(code, id) {
    if (!id.includes('/@excalidraw/excalidraw/dist/prod/')) return null
    // The published dependency includes its website's cloud configuration.
    // Keep it out of our offline editor, including its Firebase client key.
    const offline = code.replace(/\b(VITE_APP_(?:BACKEND_\w+|LIBRARY_\w+|PLUS_\w+|AI_BACKEND|WS_SERVER_URL|FIREBASE_CONFIG)):(["'`])[\s\S]*?\2/g,
      (_match, name) => `${name}:${JSON.stringify(name === 'VITE_APP_FIREBASE_CONFIG' ? '{}' : '')}`)
    const next = offline.replace(/(["'`])\.\/fonts\/([^"'`]+\.woff2)\1/g, (_match, quote, font) => {
      embeddedFonts += 1
      const data = readFileSync(resolve('node_modules/@excalidraw/excalidraw/dist/prod/fonts', font))
      return `${quote}data:font/woff2;base64,${data.toString('base64')}${quote}`
    })
    return next === code ? null : { code: next, map: null }
  },
  closeBundle() {
    if (!embeddedFonts) throw new Error('No Excalidraw fonts were embedded')
  }
}

export default defineConfig({
  plugins: [embedExcalidrawFonts, viteSingleFile()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    rollupOptions: {
      input: 'editor.html'
    }
  },
  define: {
    'process.env.IS_PREACT': JSON.stringify('false')
  }
})
