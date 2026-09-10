import React, { useCallback, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Excalidraw, MainMenu, serializeAsJSON } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import './styles.css'
import { installHandoff } from './handoff.js'

const storageKey = `hermes.excalidraw.scene:${location.hash.slice(1) || 'default'}`

function readDrawing() {
  let raw = null
  try {
    raw = localStorage.getItem(storageKey)
    const scene = raw ? JSON.parse(raw) : null
    if (raw !== null && (!scene || scene.type !== 'excalidraw' || !Array.isArray(scene.elements))) {
      throw new Error('Invalid drawing')
    }
    return { scene, raw, error: false }
  } catch {
    return { scene: null, raw, error: true }
  }
}

function Editor() {
  const [initial, setInitial] = useState(readDrawing)
  const [theme, setTheme] = useState('light')
  const [saveError, setSaveError] = useState(false)
  const [api, setApi] = useState(null)
  const [backup, setBackup] = useState(() => {
    try { return localStorage.getItem(`${storageKey}:before-agent`) } catch { return null }
  })
  const lastSaved = useRef(initial.raw)
  const save = useCallback(raw => {
    localStorage.setItem(storageKey, raw)
    lastSaved.current = raw
    setSaveError(false)
  }, [])

  React.useEffect(() => {
    if (!api || initial.error) return
    return installHandoff({
      api, scope: location.hash.slice(1), save,
      backup: raw => {
        localStorage.setItem(`${storageKey}:before-agent`, raw)
        setBackup(raw)
      }
    })
  }, [api, initial.error, save])
  const onChange = useCallback((elements, appState, files) => {
    try {
      const next = serializeAsJSON(elements, appState, files, 'local')
      if (next !== lastSaved.current) {
        // Synchronous storage: closing or switching panes cannot outrun a save.
        localStorage.setItem(storageKey, next)
        lastSaved.current = next
      }
      setSaveError(false)
    } catch {
      setSaveError(true)
    }
  }, [])

  React.useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)')
    const updateTheme = () => setTheme(query.matches ? 'dark' : 'light')
    updateTheme()
    query.addEventListener('change', updateTheme)
    return () => query.removeEventListener('change', updateTheme)
  }, [])

  return (
    <>
      <header style={{ colorScheme: theme }}>
        {initial.error ? (
          <div role="alert">
            <p>The saved drawing could not be read. It has not been overwritten.</p>
            {initial.raw && <a download="recovery.excalidraw" href={`data:application/json;charset=utf-8,${encodeURIComponent(initial.raw)}`}>Download recovery data</a>}
            <button onClick={() => {
              if (confirm('Start an empty canvas? This replaces the saved drawing. Download recovery data first if you need it.')) {
                setInitial({ scene: null, raw: null, error: false })
              }
            }}>Start empty canvas</button>
          </div>
        ) : saveError ? (
          <p role="alert">Local save failed. Keep this pane open and use the menu to save a file before closing or switching workspaces.</p>
        ) : <p role="status">Saved on this device · use the menu to save a file</p>}
        {backup && <a download="before-agent.excalidraw" href={`data:application/json;charset=utf-8,${encodeURIComponent(backup)}`}>Download drawing before last agent result</a>}
      </header>
      {!initial.error && <main aria-label="Excalidraw canvas">
        <Excalidraw excalidrawAPI={setApi} initialData={{ ...initial.scene, scrollToContent: true }} onChange={onChange} theme={theme}>
          <MainMenu>
            <MainMenu.DefaultItems.LoadScene />
            <MainMenu.DefaultItems.SaveToActiveFile />
            <MainMenu.DefaultItems.Export />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.Separator />
            <MainMenu.DefaultItems.ToggleTheme onSelect={setTheme} />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
          </MainMenu>
        </Excalidraw>
      </main>}
    </>
  )
}

createRoot(document.getElementById('root')).render(<Editor />)
