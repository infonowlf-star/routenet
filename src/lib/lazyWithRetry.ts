import { lazy, type ComponentType } from "react";

const RELOAD_KEY = "lazy-chunk-reloaded-at";
// Allow another recovery reload if the last one was a while ago (new deploy).
const RELOAD_COOLDOWN_MS = 30_000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function canReload() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    return !last || Date.now() - last > RELOAD_COOLDOWN_MS;
  } catch {
    return true;
  }
}

function markReload() {
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/**
 * Wraps React.lazy so a failed dynamic import (stale/expired chunk after a
 * deploy or dev-server restart) retries, then hard-reloads the page once.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch {
      // Retry twice with a short backoff — handles transient network/HMR races.
      for (const delay of [300, 900]) {
        await sleep(delay);
        try {
          return await factory();
        } catch {
          /* keep trying */
        }
      }

      if (canReload()) {
        markReload();
        // Bust any cached index.html pointing at the removed chunk.
        try {
          if ("caches" in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
          if ("serviceWorker" in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map((r) => r.unregister()));
          }
        } catch {
          /* best effort */
        }
        window.location.reload();
        // Never resolves; page is reloading.
        return await new Promise<{ default: T }>(() => {});
      }

      throw new Error("Failed to load this page. Please refresh.");
    }
  });
}
