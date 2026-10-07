/*
 * The Browser's host page script, on the proxy origin (brief 50).
 *
 * It talks to exactly two parties:
 *
 *  - the desktop's Browser window (its parent), by postMessage. Only messages
 *    whose source IS the parent are obeyed. The host page's CSP lets only the
 *    desktop's origin frame it, so the parent is the desktop, and replies go
 *    to the origin the parent's messages came from, never '*';
 *  - the proxy's service worker, which holds the proxied sites' cookie jar.
 *
 * Proxied pages share this origin (that is what makes them work), so nothing
 * here trusts a message from any other window.
 *
 * Messages from the desktop: { imb: 'start', url, jar } once, then
 * { imb: 'go', url } | { imb: 'back' } | { imb: 'forward' } | { imb: 'reload' }
 * | { imb: 'jar-clear' }.
 * Messages to the desktop: { imb: 'ready' } | { imb: 'url', url }
 * | { imb: 'title', title } | { imb: 'jar', jar } | { imb: 'error', message }.
 */
(() => {
  'use strict';

  if (window.parent === window) {
    document.addEventListener('DOMContentLoaded', () => {
      document.body.textContent =
        'This page runs inside the ImbatranimOS Browser app.';
    });
    return;
  }

  let desktopOrigin = null;
  let frame = null;
  let latestJar = null;
  let started = false;

  function tell(message) {
    if (desktopOrigin) window.parent.postMessage(message, desktopOrigin);
  }

  // The desktop's keyboard guard can't see another frame taking the keyboard
  // from the Browser's page, so this page says when its keyboard has gone: a
  // moment after a blur, if neither it nor the page inside it has it. (A
  // click from here into the proxied page is a blur too, but then this
  // document still has focus through its frame.)
  window.addEventListener('blur', () => {
    setTimeout(() => {
      if (!document.hasFocus()) tell({ imb: 'frame-blur' });
    }, 0);
  });

  function fail(err) {
    tell({ imb: 'error', message: String((err && err.message) || err) });
  }

  function sendJarToWorker(jar) {
    const worker = navigator.serviceWorker.controller;
    if (worker) worker.postMessage({ imb: 'jar-load', jar: jar || '{}' });
  }

  async function controlled() {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise((resolve) =>
      navigator.serviceWorker.addEventListener('controllerchange', resolve, {
        once: true,
      }),
    );
  }

  function currentTitle() {
    try {
      return frame.frame.contentDocument.title || '';
    } catch {
      return '';
    }
  }

  async function start(url, jar) {
    if (!('serviceWorker' in navigator)) {
      throw new Error(
        'This browser offers no service workers here. The Browser app needs HTTPS, or localhost.',
      );
    }
    latestJar = jar;
    navigator.serviceWorker.addEventListener('message', (event) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.imb === 'jar' && typeof data.jar === 'string') {
        latestJar = data.jar;
        tell({ imb: 'jar', jar: data.jar });
      } else if (data.imb === 'jar-request') {
        // The worker restarted and lost its memory: give it the jar back.
        sendJarToWorker(latestJar);
      }
    });

    const { ScramjetController } = $scramjetLoadController();
    const scramjet = new ScramjetController({
      files: {
        wasm: '/scram/scramjet.wasm.wasm',
        all: '/scram/scramjet.all.js',
        sync: '/scram/scramjet.sync.js',
      },
    });
    await scramjet.init();
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await controlled();
    sendJarToWorker(latestJar);

    const connection = new BareMux.BareMuxConnection('/baremux/worker.js');
    const wisp =
      (location.protocol === 'https:' ? 'wss://' : 'ws://') +
      location.host +
      '/wisp/';
    await connection.setTransport('/epoxy/index.mjs', [{ wisp }]);

    frame = scramjet.createFrame();
    frame.frame.setAttribute('allow', 'autoplay; fullscreen');
    document.body.appendChild(frame.frame);
    frame.addEventListener('urlchange', (event) => {
      tell({ imb: 'url', url: String(event.url) });
    });
    frame.frame.addEventListener('load', () => {
      tell({ imb: 'title', title: currentTitle() });
    });
    tell({ imb: 'ready' });
    if (url) frame.go(url);
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || typeof data.imb !== 'string') {
      return;
    }
    desktopOrigin = desktopOrigin || event.origin;
    if (event.origin !== desktopOrigin) return;

    if (data.imb === 'start') {
      if (started) return;
      started = true;
      start(
        typeof data.url === 'string' ? data.url : '',
        typeof data.jar === 'string' ? data.jar : null,
      ).catch(fail);
      return;
    }
    if (!frame) return;
    if (data.imb === 'go' && typeof data.url === 'string') frame.go(data.url);
    else if (data.imb === 'back') frame.back();
    else if (data.imb === 'forward') frame.forward();
    else if (data.imb === 'reload') frame.reload();
    else if (data.imb === 'jar-clear') {
      latestJar = '{}';
      sendJarToWorker(latestJar);
      frame.reload();
    }
  });
})();
