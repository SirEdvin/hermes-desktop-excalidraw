// ../src/plugin.jsx
import { host as host2, PALETTE_AREA } from "@hermes/plugin-sdk";

// ../src/pane.jsx
import { host, useValue } from "@hermes/plugin-sdk";
import { useEffect, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
var ID = "hermes-desktop-excalidraw";
function ExcalidrawPane() {
  const workspace = useValue(host.state.cwd);
  const profile = useValue(host.state.profile);
  const scope = JSON.stringify([profile, workspace]);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [webview, setWebview] = useState(null);
  useEffect(() => {
    if (!webview) return;
    const failed = (event) => {
      if (event.errorCode !== -3) setError(`Editor failed to load: ${event.errorDescription}. Check that editor.html is installed beside plugin.js.`);
    };
    webview.addEventListener("did-fail-load", failed);
    return () => webview.removeEventListener("did-fail-load", failed);
  }, [webview]);
  useEffect(() => {
    let cancelled = false;
    const locateEditor = async () => {
      try {
        const root = await window.hermesDesktop?.desktopPluginsRoot?.();
        if (!root) throw new Error("Update Hermes Desktop: native plugin-directory access is required.");
        const file = new URL("file:///");
        file.pathname = `${root.replace(/\\/g, "/").replace(/%/g, "%25")}/${ID}/editor.html`;
        if (!cancelled) setUrl(file.href);
      } catch (failure) {
        if (!cancelled) setError(String(failure.message || failure));
      }
    };
    locateEditor();
    return () => {
      cancelled = true;
    };
  }, []);
  return /* @__PURE__ */ jsxs("section", { className: "flex h-full min-h-0 flex-col", "aria-label": "Excalidraw workspace", children: [
    error && /* @__PURE__ */ jsx("p", { role: "alert", className: "p-3 text-sm text-(--ui-text-secondary)", children: error }),
    !url && !error && /* @__PURE__ */ jsx("p", { role: "status", className: "p-3 text-sm", children: "Loading Excalidraw\u2026" }),
    url && /* @__PURE__ */ jsx(
      "webview",
      {
        src: `${url}#${encodeURIComponent(scope)}`,
        title: "Excalidraw editor",
        "aria-label": "Excalidraw editor",
        webpreferences: "contextIsolation=yes, nodeIntegration=no, sandbox=yes",
        className: "min-h-0 w-full flex-1",
        ref: setWebview
      },
      scope
    )
  ] });
}

// ../src/plugin.jsx
import { jsx as jsx2 } from "react/jsx-runtime";
var ID2 = "hermes-desktop-excalidraw";
var plugin_default = {
  id: ID2,
  name: "Hermes Desktop Excalidraw",
  register(ctx) {
    let close = null;
    let disposing = false;
    const open = () => {
      if (typeof host2.openWorkspace !== "function") {
        host2.notify({ kind: "error", message: "Update Hermes Desktop to use Excalidraw (openWorkspace SDK required)." });
        return;
      }
      close = host2.openWorkspace(ID2, {
        title: "Excalidraw",
        dock: { pane: "workspace", pos: "right" },
        minWidth: "320px",
        render: () => /* @__PURE__ */ jsx2(ExcalidrawPane, {}),
        onClose: () => {
          close = null;
          if (!disposing) ctx.storage.set("pane-open", false);
        }
      });
      ctx.storage.set("pane-open", true);
    };
    ctx.register({
      id: "toggle",
      area: PALETTE_AREA,
      data: {
        id: `${ID2}.toggle`,
        label: "Excalidraw: toggle drawing pane",
        keywords: ["drawing", "diagram", "canvas"],
        run: () => close ? close() : open()
      }
    });
    ctx.onDispose(() => {
      disposing = true;
      close?.();
    });
    if (ctx.storage.get("pane-open")) open();
  }
};
export {
  plugin_default as default
};
