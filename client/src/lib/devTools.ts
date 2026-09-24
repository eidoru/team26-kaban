import { useSyncExternalStore } from "react";

/** Builds allowed to show demo tools: local dev, or any deploy built with VITE_DEMO_TOOLS=true (pair with ALLOW_DEMO_TOOLS=true on the server for production). */
export const demoToolsAvailable = import.meta.env.DEV || import.meta.env.VITE_DEMO_TOOLS === "true";

const STORAGE_KEY = "kaban.showDemoTools";
// `storage` only fires in other tabs, so same-tab changes announce themselves with this event.
const CHANGE_EVENT = "kaban:demo-tools-change";

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void): () => void {
  function onStorage(e: StorageEvent) {
    if (e.key === STORAGE_KEY) onChange();
  }
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function write(enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(STORAGE_KEY, "true");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked (e.g. some private modes): the setting stays off.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Per-browser opt-in for demo tools. Always false on builds where they aren't available. */
export function useDemoToolsSetting(): [boolean, (enabled: boolean) => void] {
  const stored = useSyncExternalStore(subscribe, read, () => false);
  return [demoToolsAvailable && stored, write];
}
