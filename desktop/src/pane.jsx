import { host, useQuery, useQueryClient, useValue } from '@hermes/plugin-sdk'
import { useCallback, useEffect, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

import { remoteAction } from './sync-state.js'

const ID = 'hermes-desktop-excalidraw'
const BRIDGE_PREFIX = 'HERMES_EXCALIDRAW:'
const SAVE_DELAY_MS = 700

function messageFor(status) {
  return {
    loading: 'Loading workspace drawing…',
    ready: 'Saved',
    dirty: 'Unsaved changes',
    saving: 'Saving…',
    conflict: 'Drawing changed on disk',
    error: 'Drawing unavailable',
    editorError: 'Editor failed to load',
    noWorkspace: 'Open a workspace to start drawing'
  }[status]
}

function ActionButton({ children, onClick }) {
  return jsx('button', {
    type: 'button',
    className:
      'rounded border border-(--ui-stroke-secondary) px-2 py-1 text-xs font-medium ' +
      'text-(--ui-text-secondary) hover:bg-(--chrome-action-hover) focus-visible:outline-2 focus-visible:outline-(--ui-accent)',
    onClick,
    children
  })
}

export function ExcalidrawPane({ ctx }) {
  const workspace = useValue(host.state.cwd)
  const profile = useValue(host.state.profile)
  const scope = JSON.stringify([profile, workspace])
  return jsx(WorkspacePane, { ctx, workspace, scope }, scope)
}

function WorkspacePane({ ctx, workspace, scope }) {
  const queryClient = useQueryClient()
  const [webview, setWebview] = useState(null)
  const [ready, setReady] = useState(false)
  const [status, setStatusState] = useState(workspace ? 'loading' : 'noWorkspace')
  const [detail, setDetail] = useState('')

  const aliveRef = useRef(true)
  const revisionRef = useRef(null)
  const dirtyRef = useRef(false)
  const conflictRef = useRef(false)

  const savingRef = useRef(false)
  const readyRef = useRef(false)

  const timerRef = useRef(null)
  const saveRef = useRef(null)

  const setStatus = useCallback((next, nextDetail = '') => {
    if (!aliveRef.current) return
    setStatusState(next)
    setDetail(nextDetail)
  }, [])

  const readNow = useCallback(() => {
    if (!workspace) throw new Error('No active workspace')
    return ctx.rest('/scene/read', {
      method: 'POST',
      body: { workspace },
      timeoutMs: 10_000
    })
  }, [ctx, workspace])

  const query = useQuery({
    queryKey: [ID, 'scene', scope],
    queryFn: readNow,
    enabled: Boolean(workspace),
    refetchInterval: 2_500,
    refetchIntervalInBackground: false,
    retry: false
  })

  const editorQuery = useQuery({
    queryKey: [ID, 'editor-location', scope],
    queryFn: () => ctx.rest('/editor-location'),
    enabled: Boolean(workspace),
    staleTime: Infinity,
    retry: false
  })

  const execute = useCallback(
    script => {
      if (!webview) return Promise.reject(new Error('Editor is not mounted'))
      return webview.executeJavaScript(script, true)
    },
    [webview]
  )

  const loadGuest = useCallback(
    async (scene, revision, discard = false) => {
      if (!readyRef.current || !aliveRef.current) return false
      const encoded = JSON.stringify(JSON.stringify(scene))
      return execute(`window.hermesExcalidraw.loadScene(JSON.parse(${encoded}), ${JSON.stringify(revision)}, ${discard})`)
    },
    [execute]
  )

  const getSnapshot = useCallback(async () => {
    const raw = await execute('JSON.stringify(window.hermesExcalidraw.state())')
    return JSON.parse(raw)
  }, [execute])

  const queueSave = useCallback(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => saveRef.current?.(), SAVE_DELAY_MS)
  }, [])

  const saveLocal = useCallback(
    async expectedOverride => {
      if (!aliveRef.current || !workspace || !readyRef.current || savingRef.current || conflictRef.current) return
      const expectedRevision = expectedOverride || revisionRef.current
      if (!expectedRevision) return

      savingRef.current = true
      setStatus('saving')
      try {
        const snapshot = await getSnapshot()
        if (!snapshot.dirty || !aliveRef.current) return
        await queryClient.cancelQueries({ queryKey: [ID, 'scene', scope] })
        if (!aliveRef.current) return
        const result = await ctx.rest('/scene/replace', {
          method: 'POST',
          body: { workspace, scene: snapshot.scene, expected_revision: expectedRevision },
          timeoutMs: 10_000
        })
        if (!aliveRef.current) return
        revisionRef.current = result.revision
        const saved = await execute(`window.hermesExcalidraw.saved(${snapshot.generation}, ${JSON.stringify(result.revision)})`)
        const stillDirty = saved.dirty
        dirtyRef.current = stillDirty
        queryClient.setQueryData([ID, 'scene', scope], result)
        setStatus(stillDirty ? 'dirty' : 'ready')
        if (stillDirty) queueSave()
      } catch (error) {
        if (!aliveRef.current) return
        try {
          const current = await readNow()
          if (current.revision !== expectedRevision) {
            conflictRef.current = true
            setStatus('conflict', 'Your edits are preserved. Choose which version to keep.')
          } else {
            setStatus('error', error instanceof Error ? error.message : 'Save failed')
          }
        } catch {
          setStatus('error', error instanceof Error ? error.message : 'Save failed')
        }
      } finally {
        savingRef.current = false
      }
    },
    [ctx, execute, getSnapshot, queryClient, queueSave, readNow, scope, setStatus, workspace]
  )
  saveRef.current = saveLocal

  useEffect(() => {
    if (!ready || !query.data || savingRef.current) return
    let cancelled = false
    getSnapshot().then(async snapshot => {
      if (cancelled || !aliveRef.current || savingRef.current) return
      revisionRef.current = snapshot.revision
      dirtyRef.current = snapshot.dirty
      const action = remoteAction(snapshot.revision, snapshot.dirty, query.data.revision)
      if (action === 'conflict') {
        conflictRef.current = true
        setStatus('conflict', 'Your local draft is preserved. Choose which version to keep.')
      } else if (snapshot.dirty) {
        setStatus('dirty')
        if (!conflictRef.current) queueSave()
      } else if (action === 'load' || !snapshot.loaded) {
        const applied = await loadGuest(query.data.scene, query.data.revision)
        if (cancelled || !aliveRef.current) return
        if (applied) {
          revisionRef.current = query.data.revision
          conflictRef.current = false
          setStatus('ready')
        } else {
          dirtyRef.current = true
          conflictRef.current = true
          setStatus('conflict', 'An edit arrived while loading. Your local draft is preserved.')
        }
      } else {
        setStatus('ready')
      }
    }).catch(error => setStatus('editorError', String(error)))
    return () => { cancelled = true }
  }, [getSnapshot, loadGuest, query.data, query.dataUpdatedAt, queueSave, ready, setStatus])

  useEffect(() => {
    if (!query.error) return
    setStatus('error', query.error instanceof Error ? query.error.message : 'Read failed')
  }, [query.error, setStatus])

  useEffect(() => {
    if (!editorQuery.error) return
    setStatus('editorError', editorQuery.error instanceof Error ? editorQuery.error.message : 'Editor asset unavailable')
  }, [editorQuery.error, setStatus])

  useEffect(() => {
    if (!webview) return

    const onConsole = event => {
      const message = event.message || ''
      if (!message.startsWith(BRIDGE_PREFIX)) return
      try {
        const payload = JSON.parse(message.slice(BRIDGE_PREFIX.length))
        if (payload.type === 'ready') {
          readyRef.current = true
          setReady(true)
        } else if (payload.type === 'changed') {
          dirtyRef.current = true
          setStatus(conflictRef.current ? 'conflict' : 'dirty')
          if (!conflictRef.current) queueSave()
        } else if (payload.type === 'storage-error') {
          setStatus('error', 'Local draft storage is unavailable. Keep this pane open until Saved, or export the drawing from Excalidraw.')
        }
      } catch {
        setStatus('editorError', 'Editor sent an invalid bridge message.')
      }
    }
    const onFailed = event => {
      if (event.errorCode !== -3) setStatus('editorError', event.errorDescription || 'Editor load failed')
    }

    webview.addEventListener('console-message', onConsole)
    webview.addEventListener('did-fail-load', onFailed)
    return () => {
      webview.removeEventListener('console-message', onConsole)
      webview.removeEventListener('did-fail-load', onFailed)
    }
  }, [queueSave, setStatus, webview])

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      clearTimeout(timerRef.current)
    }
  }, [])

  const loadDisk = useCallback(async () => {
    if (savingRef.current) return
    clearTimeout(timerRef.current)
    savingRef.current = true
    try {
      const current = await readNow()
      if (!aliveRef.current) return
      await loadGuest(current.scene, current.revision, true)
      dirtyRef.current = false
      conflictRef.current = false
      revisionRef.current = current.revision
      queryClient.setQueryData([ID, 'scene', scope], current)
      setStatus('ready')
    } catch (error) {
      setStatus('error', error instanceof Error ? error.message : 'Read failed')
    } finally {
      savingRef.current = false
    }
  }, [loadGuest, queryClient, readNow, scope, setStatus])

  const keepMine = useCallback(async () => {
    try {
      const current = await readNow()
      conflictRef.current = false
      revisionRef.current = current.revision
      await saveLocal(current.revision)
    } catch (error) {
      setStatus('error', error instanceof Error ? error.message : 'Save failed')
    }
  }, [readNow, saveLocal, setStatus])

  const retry = useCallback(() => {
    if (editorQuery.error) editorQuery.refetch()
    else if (status === 'editorError') {
      readyRef.current = false
      setReady(false)
      webview?.reload()
    }
    else if (dirtyRef.current) saveLocal()
    else query.refetch()
  }, [editorQuery, query, saveLocal, status, webview])

  const workspaceName = workspace ? workspace.split(/[\\/]/).filter(Boolean).at(-1) : ''
  const showWebview = Boolean(workspace && editorQuery.data?.url)

  return jsxs('section', {
    className: 'relative flex h-full min-h-0 flex-col overflow-hidden',
    'aria-label': 'Excalidraw workspace',
    children: [
      jsxs('header', {
        className: 'flex min-h-9 items-center justify-between gap-2 border-b border-(--ui-stroke-secondary) px-2',
        children: [
          jsxs('div', {
            className: 'min-w-0',
            children: [
              jsx('div', { className: 'truncate text-xs font-medium text-(--ui-text-primary)', children: workspaceName || 'Excalidraw' }),
              jsx('div', {
                role: 'status',
                'aria-live': 'polite',
                className: 'truncate text-[0.6875rem] text-(--ui-text-tertiary)',
                children: messageFor(status)
              })
            ]
          }),
          status === 'conflict'
            ? jsxs('div', {
                className: 'flex shrink-0 gap-1',
                children: [
                  jsx(ActionButton, { onClick: loadDisk, children: 'Load disk' }),
                  jsx(ActionButton, { onClick: keepMine, children: 'Keep mine' })
                ]
              })
            : status === 'error' || status === 'editorError'
              ? jsx(ActionButton, { onClick: retry, children: 'Retry' })
              : null
        ]
      }),
      detail
        ? jsx('div', {
            role: 'alert',
            className: 'border-b border-(--ui-stroke-secondary) px-2 py-1.5 text-xs text-(--ui-text-secondary)',
            children: detail
          })
        : null,
      showWebview
        ? jsx('webview', {
            ref: setWebview,
            src: `${editorQuery.data.url}#${encodeURIComponent(scope)}`,
            title: 'Excalidraw editor',
            'aria-label': 'Excalidraw editor',
            'data-slot': 'excalidraw-webview',
            webpreferences: 'contextIsolation=yes, nodeIntegration=no, sandbox=yes',
            className: `min-h-0 w-full flex-1 ${ready ? 'visible' : 'invisible'}`
          })
        : jsx('div', {
            role: workspace ? 'status' : undefined,
            className: 'grid min-h-0 flex-1 place-items-center p-4 text-center text-sm text-(--ui-text-tertiary)',
            children: workspace
              ? editorQuery.error
                ? 'Editor unavailable. Use Retry to load the local asset.'
                : 'Preparing the local editor…'
              : 'Open a folder or task workspace to create hermes.excalidraw.'
          }),
      showWebview && !ready
        ? jsx('div', {
            className: 'absolute inset-x-0 bottom-0 top-9 grid place-items-center text-sm text-(--ui-text-tertiary)',
            'aria-busy': 'true',
            children: 'Loading Excalidraw…'
          })
        : null
    ]
  })
}
