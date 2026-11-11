/*
 * The proxy origin's service worker. It is Scramjet's, plus the
 * cookie jar's custody.
 *
 * Scramjet keeps proxied sites' cookies in a jar in this worker's memory. Left
 * to itself it also writes the jar into the viewing browser's IndexedDB, in
 * plaintext, on some paths. Here the jar lives only in memory and in the
 * machine's encrypted profile:
 *
 *  - every change is pushed to the host page, which hands it to the desktop,
 *    which stores it encrypted (PUT /api/browser/profile);
 *  - Scramjet's own cookie write path is intercepted before it can persist;
 *  - after a restart (browsers stop idle workers) the jar is asked back from
 *    the host page before any proxied request is answered.
 *
 * Only the host page (/host.html) may load the jar or receive it. Proxied
 * pages share this origin, so the check is on the client's URL.
 */
importScripts("/scram/scramjet.all.js");

const JAR_PUSH_DELAY_MS = 500;
const JAR_WAIT_MS = 1500;

let scramjet = null;
let jarLoaded = false;
let jarWaiters = [];
let pushTimer = null;

function isHost(client) {
  try {
    return new URL(client.url).pathname === "/host.html";
  } catch {
    return false;
  }
}

async function hosts() {
  const all = await self.clients.matchAll({ type: "window" });
  return all.filter(isHost);
}

function markJarLoaded() {
  jarLoaded = true;
  for (const wake of jarWaiters) wake();
  jarWaiters = [];
}

/** Resolves once a host page has given the jar, or after a short wait. */
function jarReady() {
  if (jarLoaded) return Promise.resolve();
  return new Promise((resolve) => {
    jarWaiters.push(resolve);
    setTimeout(resolve, JAR_WAIT_MS);
    hosts().then((list) => {
      for (const client of list) client.postMessage({ imb: "jar-request" });
    });
  });
}

function pushJarSoon() {
  if (pushTimer) return;
  pushTimer = setTimeout(async () => {
    pushTimer = null;
    const jar = scramjet.cookieStore.dump();
    for (const client of await hosts()) client.postMessage({ imb: "jar", jar });
  }, JAR_PUSH_DELAY_MS);
}

// Registered BEFORE Scramjet's own listener, so it runs first and can stop a
// message from reaching it.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.imb === "jar-load") {
    event.stopImmediatePropagation();
    if (!event.source || !isHost(event.source)) return;
    if (typeof data.jar !== "string") return;
    try {
      scramjet.cookieStore.load(data.jar);
    } catch {
      scramjet.cookieStore.load("{}");
    }
    markJarLoaded();
    return;
  }

  // A page set document.cookie. Scramjet's handler would apply it AND write
  // the whole jar to IndexedDB; apply it here instead, without the write.
  if (data.scramjet$type === "cookie" && !("scramjet$token" in data)) {
    event.stopImmediatePropagation();
    if (typeof data.cookie === "string" && typeof data.url === "string") {
      scramjet.cookieStore.setCookies([data.cookie], new URL(data.url));
    }
  }
});

const { ScramjetServiceWorker } = $scramjetLoadWorker();
scramjet = new ScramjetServiceWorker();

// Every change to the jar, from a response's Set-Cookie or from a page, goes
// through setCookies.
const setCookies = scramjet.cookieStore.setCookies.bind(scramjet.cookieStore);
scramjet.cookieStore.setCookies = (...args) => {
  const result = setCookies(...args);
  pushJarSoon();
  return result;
};

// The desktop is cross-origin isolated, so every document in the Browser's
// frame must send an embedder policy of its own (browser-proxy.server.ts).
// Scramjet strips the site's own and adds one only while this worker is
// isolated itself; this makes sure every proxied page, frame and worker has
// one. `require-corp` asks nothing of a proxied page, since all it loads
// comes through this worker from this origin; a load that slips past the
// rewriter to another origin is refused instead of fetched directly.
const ISOLATED_DESTINATIONS = new Set(["document", "iframe", "frame", "worker", "sharedworker"]);

function isolated(request, response) {
  if (!ISOLATED_DESTINATIONS.has(request.destination) && request.mode !== "navigate") {
    return response;
  }
  try {
    const headers = new Headers(response.headers);
    headers.set("Cross-Origin-Embedder-Policy", "require-corp");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    // A response that can't be rebuilt (an opaque one) goes as it came.
    return response;
  }
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    (async () => {
      await scramjet.loadConfig();
      if (scramjet.route(event)) {
        await jarReady();
        return isolated(event.request, await scramjet.fetch(event));
      }
      return fetch(event.request);
    })(),
  );
});
