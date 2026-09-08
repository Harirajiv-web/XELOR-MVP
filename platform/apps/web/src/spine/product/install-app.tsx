"use client";

import { useEffect, useState } from "react";

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Offline keeps the navigation fallback only. Business records and credentials are never cached. */
export function InstallApp(): React.JSX.Element | null {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    const install = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("beforeinstallprompt", install);
    if ("serviceWorker" in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("beforeinstallprompt", install);
    };
  }, []);
  if (offline) return <div role="status" className="fixed inset-x-0 top-0 z-[100] bg-[var(--warn-soft)] px-4 py-2 text-center text-sm text-[var(--warn-ink)]">You’re offline. Reconnect to refresh records or submit changes.</div>;
  if (!prompt) return null;
  return <button type="button" onClick={async () => { await prompt.prompt(); await prompt.userChoice; setPrompt(null); }} className="fixed bottom-20 right-4 z-40 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] shadow-lg md:bottom-5">Install app</button>;
}
