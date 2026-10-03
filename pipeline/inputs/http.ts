import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

export type FetchLike = (url: string, init?: { headers?: Record<string, string>; method?: string }) => Promise<Response>;

export class SharedInputError extends Error {}

export async function getJson<T>(url: string, headers: Record<string, string>, fetchImpl: FetchLike = fetch): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(url, { headers });
  } catch (e) {
    throw new SharedInputError(`GET ${url} failed: ${(e as Error).message}`);
  }
  if (!res.ok) throw new SharedInputError(`GET ${url} returned HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Downloads url to path unless it already exists. */
export async function downloadOnce(url: string, path: string, headers: Record<string, string>): Promise<string> {
  if (existsSync(path) && statSync(path).size > 0) return path;
  mkdirSync(dirname(path), { recursive: true });
  const res = await fetch(url, { headers });
  if (!res.ok || !res.body) throw new SharedInputError(`GET ${url} returned HTTP ${res.status}`);
  const tmp = `${path}.part`;
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(tmp));
  const { renameSync } = await import('node:fs');
  renameSync(tmp, path);
  return path;
}

/** Caches a JSON GET for maxAgeHours in path. */
export async function cachedJson<T>(url: string, path: string, headers: Record<string, string>, maxAgeHours: number, offline = false): Promise<T> {
  if (existsSync(path)) {
    const age = (Date.now() - statSync(path).mtimeMs) / 3_600_000;
    if (offline || age < maxAgeHours) return JSON.parse(readFileSync(path, 'utf8')) as T;
  }
  if (offline) throw new SharedInputError(`Offline and no cached copy of ${url}`);
  const data = await getJson<T>(url, headers);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data));
  return data;
}
