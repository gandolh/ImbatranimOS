import type { SystemHttp } from "@imbatranim/ui";

/** The most bytes any one photo is read for, over all its requests. */
export const MAX_RANGE_BYTES = 64 * 1024;

/**
 * Reads `length` bytes of one file from `start`, through `GET /files/download`
 * with a `Range` header (the backend answers 206). Asks for at most
 * {@link MAX_RANGE_BYTES} at once. A server that ignores the range answers 200
 * with the whole file: the result is cut to the requested window, so the caller
 * never holds more than it asked for (the transfer itself is the server's).
 * Past the end of the file the backend answers 416, which rejects.
 * Takes the http capability as a parameter: only hooks may call `useSystem()`.
 */
export async function readRange(
  http: SystemHttp,
  root: string,
  path: string,
  start: number,
  length: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const count = Math.max(0, Math.min(Math.floor(length), MAX_RANGE_BYTES));
  const from = Math.max(0, Math.floor(start));
  if (count === 0) return new Uint8Array(0);
  const res = await http.get<ArrayBuffer>("/files/download", {
    params: { root, path },
    headers: { Range: `bytes=${from}-${from + count - 1}` },
    responseType: "arraybuffer",
    signal,
  });
  const body = new Uint8Array(res.data);
  // 206: the body is the window. 200: the whole file, so cut the window out.
  const window = res.status === 206 ? body : body.subarray(from, from + count);
  return window.length > count ? window.subarray(0, count) : window;
}
