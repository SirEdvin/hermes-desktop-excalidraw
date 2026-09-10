import { Button, useQuery } from '@hermes/plugin-sdk'
import { useEffect, useRef, useState } from 'react'
import { readText } from './handoff-files.js'
import { parseScene } from './scene.js'
import { callScene } from './scene-client.js'

const validPath = path => typeof path === 'string' && /^(\/|[A-Za-z]:[\\/]|\\\\)/.test(path) && !/[\u0000-\u001f]/.test(path) && /\.excalidraw$/i.test(path)
function load(storage, key) {
  try {
    const value = storage.get(key)
    if (!value) return { path: '', enabled: false }
    if (value.version !== 1 || !validPath(value.path) || typeof value.enabled !== 'boolean') throw new Error('Invalid selection')
    return value
  } catch { return { path: '', enabled: false, error: 'Could not restore the selected file. Open it again.' } }
}

function LiveImage({ path, scope, webview }) {
  const last = useRef(null)
  const [instance] = useState(() => crypto.randomUUID())
  const { data, error } = useQuery({
    queryKey: ['hermes-excalidraw-live', scope, path, instance],
    enabled: Boolean(webview),
    networkMode: 'always',
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async ({ signal }) => {
      const active = () => !signal.aborted
      if (typeof window.hermesDesktop?.readFileText !== 'function') throw new Error('Update Hermes Desktop: native file reading is required.')
      const raw = await readText(window.hermesDesktop, path)
      if (!active()) throw new Error('File view closed.')
      if (last.current?.raw === raw) return last.current
      parseScene(raw)
      const rendered = await callScene(webview, scope, 'render', { raw }, active)
      if (!active()) throw new Error('File view closed.')
      last.current = { ...rendered, raw }
      return last.current
    }
  })
  return (
    <div className="hx-live-view" aria-label="Read-only file view">
      <p className="hx-live-path">{path}</p>
      <p role="status">Read-only · checks every 2 seconds{data ? ` · ${data.count} elements` : ' · waiting for drawing…'}</p>
      {error && <p role="alert">{error.message} Keeping the last valid image, if available. Retrying automatically.</p>}
      <div className="hx-live-image">
        {data?.image ? <img src={data.image} alt="Live Excalidraw drawing" /> : data && <p>Empty drawing</p>}
      </div>
    </div>
  )
}

export function LiveFilePanel({ scope, workspace, storage, webview, children }) {
  const key = `live-file:${scope}`
  const [selection, setSelection] = useState(() => load(storage, key))
  const [error, setError] = useState(selection.error || '')
  const [choosing, setChoosing] = useState(false)
  const openButton = useRef(null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const select = next => {
    setSelection(next)
    setError('')
    try {
      storage.set(key, next)
      const saved = storage.get(key)
      if (saved?.path !== next.path || saved.enabled !== next.enabled) throw new Error('Storage unavailable')
    } catch { setError('Desktop could not remember this selection. You can keep viewing, but may need to open the file again after restart.') }
  }
  const choose = async () => {
    setChoosing(true); setError('')
    try {
      const api = window.hermesDesktop
      if (typeof api?.selectPaths !== 'function' || typeof api?.readFileText !== 'function') throw new Error('Update Hermes Desktop: native file selection and reading are required.')
      const paths = await api.selectPaths({ title: 'Open a live Excalidraw file', defaultPath: selection.path || workspace || undefined, directories: false, multiple: false, filters: [{ name: 'Excalidraw drawings', extensions: ['excalidraw'] }] })
      if (!alive.current || !paths?.length) return
      if (!validPath(paths[0])) throw new Error('Choose an absolute path to an .excalidraw file.')
      select({ version: 1, path: paths[0], enabled: true })
    } catch (failure) { if (alive.current) setError(String(failure.message || failure)) }
    finally { if (alive.current) setChoosing(false) }
  }
  return (
    <div className="hx-file-panel">
      <style>{`
        .hx-file-panel, .hx-manual { display:flex; flex-direction:column; flex:1; min-height:0; min-width:0; }
        .hx-manual[hidden] { display:none; }
        .hx-live-toolbar { display:flex; flex-wrap:wrap; gap:.5rem; padding:.5rem .75rem; border-bottom:1px solid var(--ui-stroke-secondary); }
        .hx-live-view { display:flex; flex-direction:column; flex:1; min-height:0; padding:.75rem; gap:.5rem; overflow:auto; color:var(--ui-text-primary); }
        .hx-live-view p, .hx-live-error { margin:0; font-size:.75rem; overflow-wrap:anywhere; }
        .hx-live-path, .hx-live-view [role=status] { color:var(--ui-text-secondary); }
        .hx-live-error { padding:.5rem .75rem; color:var(--ui-text-primary); }
        .hx-live-image { display:flex; flex:1; min-height:0; align-items:center; justify-content:center; }
        .hx-live-image img { display:block; width:100%; height:100%; object-fit:contain; }
      `}</style>
      <div className="hx-live-toolbar">
        <Button ref={openButton} variant="secondary" size="sm" disabled={choosing} onClick={choose}>Open live file</Button>
        {selection.enabled && <Button variant="secondary" size="sm" disabled={choosing} onClick={() => { select({ ...selection, enabled: false }); openButton.current?.focus() }}>Return to editor</Button>}
      </div>
      {error && <p className="hx-live-error" role="alert">{error}</p>}
      {selection.enabled && <LiveImage key={selection.path} path={selection.path} scope={scope} webview={webview} />}
      <div className="hx-manual" hidden={selection.enabled}>{children}</div>
    </div>
  )
}
