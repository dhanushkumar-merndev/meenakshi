"use client";

import { useEffect } from "react";

/** Registers the offline-viewing service worker once the page has loaded. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support is a progressive enhancement -- a registration
      // failure (unsupported browser, blocked storage, ...) must never
      // break the app itself.
    });
  }, []);
  return null;
}
