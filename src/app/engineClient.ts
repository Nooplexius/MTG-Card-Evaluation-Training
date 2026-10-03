import { client, type RpcClient } from '../engine/rpc.ts';
import type { EngineApi } from '../engine/engine.worker.ts';

let instance: RpcClient<EngineApi> | null = null;

export function engine(): RpcClient<EngineApi> {
  if (!instance) {
    const worker = new Worker(new URL('../engine/engine.worker.ts', import.meta.url), { type: 'module', name: 'loupe-engine' });
    instance = client<EngineApi>(worker);
  }
  return instance;
}

export function baseUrl(): string {
  return new URL(import.meta.env.BASE_URL, location.href).href;
}
