import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vm from 'node:vm';

/*
 * The proxy origin's service worker (static/sw.js), run in a vm with a
 * stand-in Scramjet whose `fetch` answers what each test says. Only the
 * embedder policy is under test here: what a proxied document, frame or
 * worker is answered with, since the isolated desktop frames them all.
 */

const SOURCE = readFileSync(join(__dirname, 'static', 'sw.js'), 'utf8');

interface FakeRequest {
  url: string;
  destination: string;
  mode: string;
}

type Listener = (event: unknown) => void;

function loadWorker(answer: (request: FakeRequest) => Response) {
  const listeners = new Map<string, Listener[]>();
  const self = {
    addEventListener: (type: string, listener: Listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    clients: { matchAll: () => Promise.resolve([]), claim: () => undefined },
    skipWaiting: () => undefined,
  };
  class ScramjetServiceWorker {
    cookieStore = { load() {}, dump: () => '{}', setCookies() {} };
    loadConfig() {
      return Promise.resolve();
    }
    route(event: { request: FakeRequest }) {
      return new URL(event.request.url).pathname.startsWith('/scramjet/');
    }
    fetch(event: { request: FakeRequest }) {
      return Promise.resolve(answer(event.request));
    }
  }
  const context = vm.createContext({
    self,
    importScripts: () => undefined,
    $scramjetLoadWorker: () => ({ ScramjetServiceWorker }),
    fetch: () => Promise.resolve(new Response('from the network')),
    Headers,
    Response,
    URL,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(SOURCE, context);

  // A host page hands the jar over, so proxied requests don't wait for it.
  for (const listener of listeners.get('message') ?? []) {
    listener({
      data: { imb: 'jar-load', jar: '{}' },
      source: { url: 'http://localhost:3002/host.html' },
      stopImmediatePropagation: () => undefined,
    });
  }

  return (request: FakeRequest): Promise<Response> => {
    let answered: Promise<Response> | undefined;
    for (const listener of listeners.get('fetch') ?? []) {
      listener({
        request,
        respondWith: (p: Promise<Response>) => {
          answered = p;
        },
      });
    }
    return answered!;
  };
}

const PAGE = 'http://localhost:3002/scramjet/https%3A%2F%2Fexample.com%2F';

describe('the Browser proxy’s service worker', () => {
  it('answers a proxied page with an embedder policy, keeping its status, headers and body', async () => {
    const fetchVia = loadWorker(
      () =>
        new Response('<p>hi</p>', {
          status: 404,
          statusText: 'Not Found',
          headers: { 'Content-Type': 'text/html', 'X-Site': 'kept' },
        }),
    );
    const res = await fetchVia({
      url: PAGE,
      destination: 'iframe',
      mode: 'navigate',
    });
    expect(res.headers.get('cross-origin-embedder-policy')).toBe(
      'require-corp',
    );
    expect(res.status).toBe(404);
    expect(res.statusText).toBe('Not Found');
    expect(res.headers.get('content-type')).toBe('text/html');
    expect(res.headers.get('x-site')).toBe('kept');
    expect(await res.text()).toBe('<p>hi</p>');
  });

  it('gives one to every proxied document and worker, over any the site sent', async () => {
    const fetchVia = loadWorker(
      () =>
        new Response('x', {
          headers: { 'Cross-Origin-Embedder-Policy': 'unsafe-none' },
        }),
    );
    for (const destination of [
      'document',
      'iframe',
      'frame',
      'worker',
      'sharedworker',
    ]) {
      const res = await fetchVia({ url: PAGE, destination, mode: 'cors' });
      expect(res.headers.get('cross-origin-embedder-policy')).toBe(
        'require-corp',
      );
    }
  });

  it('leaves a proxied page’s images, scripts and data as Scramjet answered them', async () => {
    const answers: Response[] = [];
    const fetchVia = loadWorker(() => {
      const res = new Response('x');
      answers.push(res);
      return res;
    });
    for (const destination of ['image', 'script', 'style', '']) {
      const res = await fetchVia({ url: PAGE, destination, mode: 'no-cors' });
      expect(res).toBe(answers[answers.length - 1]);
      expect(res.headers.get('cross-origin-embedder-policy')).toBeNull();
    }
  });

  it('passes the proxy origin’s own files through to the network', async () => {
    const fetchVia = loadWorker(() => {
      throw new Error('Scramjet should not see this');
    });
    const res = await fetchVia({
      url: 'http://localhost:3002/host.html',
      destination: 'iframe',
      mode: 'navigate',
    });
    expect(await res.text()).toBe('from the network');
  });
});
