import { registerSW } from "virtual:pwa-register";

const APP_SW_PATH = `${import.meta.env.BASE_URL || "/"}sw.js`;

function isGithubPages() {
  return window.location.hostname.endsWith(".github.io") || window.location.hostname === "github.io";
}

function isInIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function isPreviewHost(hostname: string) {
  return (
    hostname.startsWith("id-preview--") ||
    hostname.startsWith("preview--") ||
    hostname === "lovableproject.com" ||
    hostname.endsWith(".lovableproject.com") ||
    hostname === "lovableproject-dev.com" ||
    hostname.endsWith(".lovableproject-dev.com") ||
    hostname === "beta.lovable.dev" ||
    hostname.endsWith(".beta.lovable.dev")
  );
}

async function unregisterAppServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations
        .filter((registration) => registration.active?.scriptURL.endsWith(APP_SW_PATH) || registration.scope === `${window.location.origin}/`)
        .map((registration) => registration.unregister()),
    );
  } catch {
    // Preview safety cleanup must never block app startup.
  }
}

export function registerAppPwa() {
  if (!("serviceWorker" in navigator)) return;

  const shouldRefuseRegistration =
    !import.meta.env.PROD ||
    isGithubPages() ||
    isInIframe() ||
    isPreviewHost(window.location.hostname) ||
    new URLSearchParams(window.location.search).get("sw") === "off";

  if (shouldRefuseRegistration) {
    void unregisterAppServiceWorkers();
    return;
  }

  registerSW({ immediate: true });
}