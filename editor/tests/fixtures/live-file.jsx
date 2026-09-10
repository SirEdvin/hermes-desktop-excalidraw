import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LiveFilePanel } from '../../../src/live-file.jsx'

const raw = JSON.stringify({ type: 'excalidraw', elements: [], appState: {}, files: {} })
const metadata = new Map()
const f = window.fixture = { raw, metadata, path: '/project/дерево with spaces.excalidraw', reads: 0, renders: 0, writes: 0 }
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg=='
window.hermesDesktop = {
  selectPaths: async options => { f.options = options; if (f.delayPicker) await new Promise(resolve => f.releasePicker = resolve); return f.cancel ? [] : [f.path] },
  readFileText: async path => {
    f.reads++; f.readPath = path
    const text = f.raw
    if (f.delayRead) await new Promise(resolve => f.releaseRead = resolve)
    if (f.missing) throw new Error('File not found')
    return { text, truncated: f.truncated, binary: f.binary }
  },
  writeTextFile: () => { f.writes++; throw new Error('Live view cannot write') }
}
const webview = { executeJavaScript: async script => new Function('window', `return ${script}`)({ hermesDrawingHandoff: async request => {
  f.renders++
  if (f.delayRender) await new Promise(resolve => f.releaseRender = resolve)
  if (f.renderFailure) return { ...request, ok: false, error: 'Rendering failed' }
  return { ...request, ok: true, result: { image: JSON.parse(request.raw).elements.length ? png : null, count: JSON.parse(request.raw).elements.length } }
} }) }
const storage = {
  get: key => metadata.get(key),
  set: (key, value) => { if (f.storageFailure) throw new Error('Full'); metadata.set(key, value) }
}
const client = new QueryClient()
const root = createRoot(document.getElementById('root'))
f.mount = (scope = 'a', open = true) => root.render(<QueryClientProvider client={client}>{open && <LiveFilePanel key={scope} scope={scope} workspace="/project" webview={webview} storage={storage}><p>Manual drawing untouched</p></LiveFilePanel>}</QueryClientProvider>)
f.mount()
