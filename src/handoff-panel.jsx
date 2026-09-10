import { Button, Textarea } from '@hermes/plugin-sdk'
import { useEffect, useRef, useState } from 'react'
import { fingerprint } from './scene.js'
import { instructions, prepareHandoff, readResult, requireFiles } from './handoff-files.js'
import { callScene } from './scene-client.js'

function load(storage, key, scope) {
  try {
    const value = storage.get(key)
    return value?.version === 1 && value.scope === scope && typeof value.input === 'string' && typeof value.output === 'string' && typeof value.baseline === 'string' ? value : null
  } catch { return null }
}

export function HandoffPanel({ webview, scope, workspace, storage }) {
  const key = `handoff:${scope}`
  const [handoff, setHandoff] = useState(() => load(storage, key, scope))
  const [directory, setDirectory] = useState(handoff?.directory || '')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const alive = useRef(true)
  const working = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const active = () => alive.current
  const scene = (action, data) => callScene(webview, scope, action, data, active)
  const run = async action => {
    if (working.current) return
    working.current = true
    setBusy(true); setError(''); setMessage('')
    try { await action() } catch (failure) { if (active()) setError(String(failure.message || failure)) }
    finally { working.current = false; if (active()) setBusy(false) }
  }
  const choose = () => run(async () => {
    const api = window.hermesDesktop
    requireFiles(api)
    if (!api.selectPaths) throw new Error('Update Hermes Desktop to choose a handoff folder.')
    const paths = await api.selectPaths({ title: 'Choose a folder shared with your Hermes session', directories: true, multiple: false, defaultPath: directory || workspace || undefined })
    if (active() && paths[0]) setDirectory(paths[0])
  })
  const prepare = () => run(async () => {
    const { raw } = await scene('snapshot')
    const next = { ...await prepareHandoff(window.hermesDesktop, directory, raw, scope, crypto.randomUUID(), active), directory }
    if (!active()) return
    storage.set(key, next)
    if (storage.get(key)?.id !== next.id) throw new Error('The input was exported, but Desktop could not remember this handoff. Free local storage and prepare a fresh handoff.')
    setHandoff(next); setPreview(null); setConfirmed(false)
    setMessage('Input file verified. Copy the instructions and paste them into your Hermes session with your drawing request.')
  })
  const copy = () => run(async () => {
    if (!window.hermesDesktop?.writeClipboard || !await window.hermesDesktop.writeClipboard(instructions(handoff))) throw new Error('Could not copy. Select and copy the instructions below instead.')
    if (active()) setMessage('Instructions copied. Paste them into the intended session and add your drawing request. Nothing was sent automatically.')
  })
  const read = () => run(async () => {
    setPreview(null); setConfirmed(false)
    const raw = await readResult(window.hermesDesktop, handoff)
    if (!active()) return
    const next = await scene('preview', { raw })
    const changed = await fingerprint(next.expected) !== handoff.baseline
    if (active()) { setPreview({ ...next, changed }); setMessage('Preview only — your canvas has not changed.') }
  })
  const apply = () => run(async () => {
    if (preview.changed && !confirmed) return
    await scene('apply', { previewId: preview.previewId })
    if (!active()) return
    setPreview(null); setConfirmed(false)
    setMessage('Result applied and saved on this device. The previous drawing is available from the recovery download inside the editor.')
  })

  return (
    <details className="hx-handoff">
      <style>{`
        .hx-handoff { flex: 0 1 auto; min-height: 2.5rem; max-height: 55%; overflow: auto; border-bottom: 1px solid var(--ui-stroke-secondary); color: var(--ui-text-primary); font-size: .75rem; }
        .hx-handoff > summary { cursor: pointer; padding: .75rem; font-weight: 600; }
        .hx-handoff summary:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: -2px; }
        .hx-handoff-body { display: flex; flex-direction: column; gap: .75rem; padding: 0 .75rem .75rem; }
        .hx-handoff p { margin: 0; overflow-wrap: anywhere; }
        .hx-handoff-actions { display: flex; flex-wrap: wrap; gap: .5rem; }
        .hx-handoff-muted { color: var(--ui-text-secondary); }
        .hx-handoff figure { margin: 0; display: flex; flex-direction: column; gap: .5rem; }
        .hx-handoff img { display: block; width: 100%; max-height: 14rem; object-fit: contain; border: 1px solid var(--ui-stroke-secondary); border-radius: .25rem; }
        .hx-handoff label { display: flex; gap: .5rem; align-items: flex-start; }
        .hx-handoff input { accent-color: var(--ui-accent); }
        .hx-handoff textarea { min-height: 7rem; max-height: 12rem; font-size: .75rem; }
      `}</style>
      <summary>Agent handoff</summary>
      <div className="hx-handoff-body" aria-busy={busy}>
        <p className="hx-handoff-muted">Share drawing files with a Hermes session that can access this computer’s paths. No extra tools or backend required.</p>
        <div className="hx-handoff-actions">
          <Button variant="secondary" size="sm" disabled={busy} onClick={choose}>Choose folder</Button>
          <Button variant="secondary" size="sm" disabled={busy || !directory || !webview} onClick={prepare}>Prepare handoff</Button>
        </div>
        {directory && <p className="hx-handoff-muted">Folder: {directory}</p>}
        {handoff && <>
          <p className="hx-handoff-muted">Input: {handoff.input}<br />Agent output: {handoff.output}</p>
          <div className="hx-handoff-actions">
            <Button variant="secondary" size="sm" disabled={busy} onClick={copy}>Copy agent instructions</Button>
            <Button variant="secondary" size="sm" disabled={busy || !webview} onClick={read}>Read result</Button>
          </div>
          <details><summary>View instructions</summary><Textarea aria-label="Agent instructions" readOnly value={instructions(handoff)} /></details>
        </>}
        {busy && <p role="status">Working…</p>}
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        {preview && <>
          <figure>
            {preview.image ? <img src={preview.image} alt="Preview of the agent drawing result" /> : <p>Empty drawing preview</p>}
            <figcaption>{preview.count} elements · applying replaces the current drawing</figcaption>
          </figure>
          {preview.changed && <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />My drawing changed since this handoff. Replace it with this result and keep a recovery copy.</label>}
          <div className="hx-handoff-actions">
            <Button size="sm" disabled={busy || (preview.changed && !confirmed)} onClick={apply}>Apply result</Button>
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => { setPreview(null); setMessage('Preview discarded. Your canvas was not changed.') }}>Discard preview</Button>
          </div>
        </>}
      </div>
    </details>
  )
}
