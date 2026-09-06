import React, { useCallback, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { CaptureUpdateAction, Excalidraw, restore, serializeAsJSON } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import './styles.css'
import { saveLeavesDirty } from '../../desktop/src/sync-state.js'

const PREFIX = 'HERMES_EXCALIDRAW:'
const source = 'hermes-desktop-excalidraw'
let api = null
let latestScene = null
let applyingScene = false
let loaded = false
let revision = null
let generation = 0
let dirty = false
let storageError = false
const draftKey = location.hash ? `hermes.excalidraw.draft:${location.hash.slice(1)}` : null

function persistDraft() {
  if (!draftKey) return
  try {
    if (dirty) localStorage.setItem(draftKey, JSON.stringify({ scene: latestScene, revision }))
    else localStorage.removeItem(draftKey)
    storageError = false
  } catch {
    storageError = true
    emit('storage-error')
  }
}

function emit(type) {
  console.info(`${PREFIX}${JSON.stringify({ type })}`)
}

function normalizeScene(scene) {
  return {
    ...scene,
    type: 'excalidraw',
    version: 2,
    source,
    elements: Array.isArray(scene.elements) ? scene.elements : [],
    appState: scene.appState && typeof scene.appState === 'object' ? scene.appState : {},
    files: scene.files && typeof scene.files === 'object' ? scene.files : {}
  }
}

function snapshot(elements, appState, files) {
  return normalizeScene(JSON.parse(serializeAsJSON(elements, appState, files, source)))
}

function installBridge(excalidrawApi) {
  if (api === excalidrawApi) return
  api = excalidrawApi
  latestScene ||= normalizeScene({})
  window.hermesExcalidraw = Object.freeze({
    loadScene(scene, nextRevision = null, discard = false) {
      if (dirty && !discard) return false
      const next = restore(normalizeScene(scene), null, null)
      applyingScene = true
      try {
        flushSync(() => {
          api.resetScene()
          const fileValues = Object.values(next.files || {})
          if (fileValues.length) api.addFiles(fileValues)
          api.updateScene({ elements: next.elements, appState: next.appState, captureUpdate: CaptureUpdateAction.NEVER })
        })
        latestScene = snapshot(api.getSceneElements(), api.getAppState(), api.getFiles())
        revision = nextRevision
        loaded = true
        dirty = false
        generation += 1
        persistDraft()
        document.querySelector('main').inert = false
      } finally {
        applyingScene = false
      }
      return true
    },
    snapshot() {
      if (!latestScene) throw new Error('Editor scene is not ready')
      return latestScene
    },
    state() {
      return { scene: latestScene, revision, generation, dirty, loaded, storageError }
    },
    saved(savedGeneration, nextRevision) {
      revision = nextRevision
      dirty = saveLeavesDirty(generation, savedGeneration)
      persistDraft()
      return { dirty, revision, storageError }
    }
  })
  // Restore before accepting remote scenes; failed saves survive unmount/restart.
  setTimeout(() => {
    if (draftKey) {
      try {
        const raw = localStorage.getItem(draftKey)
        if (raw) {
          const draft = JSON.parse(raw)
          window.hermesExcalidraw.loadScene(draft.scene, draft.revision)
          dirty = true
          persistDraft()
        }
      } catch {
        storageError = true
        emit('storage-error')
      }
    }
    emit('ready')
  }, 0)
}

function Editor() {
  const [theme, setTheme] = useState('light')
  const onChange = useCallback((elements, appState, files) => {
    if (applyingScene || !loaded) return
    const next = snapshot(elements, appState, files)
    if (JSON.stringify(next) === JSON.stringify(latestScene)) return
    latestScene = next
    dirty = true
    generation += 1
    emit('changed')
    persistDraft()
  }, [])

  React.useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)')
    const updateTheme = () => setTheme(query.matches ? 'dark' : 'light')
    updateTheme()
    query.addEventListener('change', updateTheme)
    return () => query.removeEventListener('change', updateTheme)
  }, [])

  return (
    <main aria-label="Excalidraw canvas" inert="">
      <Excalidraw excalidrawAPI={installBridge} onChange={onChange} theme={theme} />
    </main>
  )
}

createRoot(document.getElementById('root')).render(<Editor />)
