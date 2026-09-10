import React from 'react'
import { createRoot } from 'react-dom/client'
import { HandoffPanel } from '../../../src/handoff-panel.jsx'

const entries = new Map()
const metadata = new Map()
const raw = JSON.stringify({ type: 'excalidraw', version: 2, elements: [], files: {}, appState: {} })
window.fixture = { entries, metadata, raw, copied: '', applied: 0, scope: 'a' }
window.hermesDesktop = {
  selectPaths: async () => ['/shared/дерево with spaces'],
  readDir: async () => ({ entries: [...entries.keys()].map(path => ({ path, name: path.split('/').at(-1) })) }),
  writeTextFile: async (path, text) => { entries.set(path, text); return { path } },
  readFileText: async path => {
    if (window.fixture.delay) await new Promise(resolve => { window.fixture.release = resolve })
    if (!entries.has(path)) throw new Error('Output not found. Wait for the agent to finish.')
    return { text: entries.get(path), truncated: false }
  },
  writeClipboard: async text => { window.fixture.copied = text; return !window.fixture.clipboardFailure }
}
const guest = { hermesDrawingHandoff: async request => ({ ...request, ok: true, result: request.action === 'snapshot' ? { raw } : request.action === 'preview' ? {
  expected: window.fixture.changed ? raw + ' ' : raw, previewId: request.id, image: null, count: 0
} : { applied: ++window.fixture.applied } }) }
const webview = { executeJavaScript: async script => new Function('window', `return ${script}`)(guest) }
const storage = { get: key => metadata.get(key), set: (key, value) => metadata.set(key, value) }
const root = createRoot(document.getElementById('root'))
window.fixture.mount = (scope = 'a') => {
  window.fixture.scope = scope
  root.render(<HandoffPanel key={scope} webview={webview} scope={scope} workspace="/shared" storage={storage} />)
}
window.fixture.mount()
