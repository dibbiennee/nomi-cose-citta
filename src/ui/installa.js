// Aggiunta alla schermata Home. Solo browser: lo usa la home per il pannello "Usalo come un'app".

let deferred = null; // l'invito all'installazione di Chrome, tenuto da parte finché la persona tocca il pulsante
const listeners = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; listeners.forEach((f) => f()); });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((f) => f()); });
}

/** Già aperto dalla schermata Home: il link non serve. */
export function isStandalone() {
  try { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; } catch (e) { return false; }
}

/** Telefono e browser: { ios, browser: 'safari' | 'chrome' | 'app' (dentro WhatsApp, Instagram...) | null } */
export function platform() {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
  const app = /WhatsApp|Instagram|FBAN|FBAV|Line\/|TikTok|musical_ly|BytedanceWebview|trill/.test(ua);
  let browser = null;
  if (app) browser = 'app';
  else if (/CriOS|Chrome\//.test(ua) && !/EdgA|EdgiOS|OPR|SamsungBrowser/.test(ua)) browser = 'chrome';
  else if (ios && /Safari/.test(ua) && !/FxiOS|EdgiOS/.test(ua)) browser = 'safari';
  return { ios, browser };
}

export const canPrompt = () => deferred !== null;
export function onPromptChange(f) { listeners.add(f); return () => listeners.delete(f); }

/** Apre la finestra di installazione di Chrome. Restituisce true se la persona ha accettato. */
export async function promptInstall() {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  listeners.forEach((f) => f());
  e.prompt();
  const { outcome } = await e.userChoice;
  return outcome === 'accepted';
}
