import { host, useValue } from '@hermes/plugin-sdk'
import { useEffect, useState } from 'react'

const ID = 'hermes-desktop-excalidraw'

export function ExcalidrawPane() {
  const workspace = useValue(host.state.cwd)
  const profile = useValue(host.state.profile)
  const scope = JSON.stringify([profile, workspace])
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [webview, setWebview] = useState(null)

  useEffect(() => {
    if (!webview) return
    const failed = event => {
      if (event.errorCode !== -3) setError(`Editor failed to load: ${event.errorDescription}. Check that editor.html is installed beside plugin.js.`)
    }
    webview.addEventListener('did-fail-load', failed)
    return () => webview.removeEventListener('did-fail-load', failed)
  }, [webview])

  useEffect(() => {
    let cancelled = false
    const locateEditor = async () => {
      try {
        const root = await window.hermesDesktop?.desktopPluginsRoot?.()
        if (!root) throw new Error('Update Hermes Desktop: native plugin-directory access is required.')
        const file = new URL('file:///')
        file.pathname = `${root.replace(/\\/g, '/').replace(/%/g, '%25')}/${ID}/editor.html`
        if (!cancelled) setUrl(file.href)
      } catch (failure) {
        if (!cancelled) setError(String(failure.message || failure))
      }
    }
    locateEditor()
    return () => { cancelled = true }
  }, [])

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Excalidraw workspace">
      {error && <p role="alert" className="p-3 text-sm text-(--ui-text-secondary)">{error}</p>}
      {!url && !error && <p role="status" className="p-3 text-sm">Loading Excalidraw…</p>}
      {url && (
        <webview
          key={scope}
          src={`${url}#${encodeURIComponent(scope)}`}
          title="Excalidraw editor"
          aria-label="Excalidraw editor"
          webpreferences="contextIsolation=yes, nodeIntegration=no, sandbox=yes"
          className="min-h-0 w-full flex-1"
          ref={setWebview}
        />
      )}
    </section>
  )
}
