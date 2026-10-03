/** Minimal promise RPC over postMessage. */
type Handler = (...args: never[]) => unknown;

interface Req {
  id: number;
  method: string;
  args: unknown[];
}
type Res = { id: number; result?: unknown; error?: string } | { event: string; payload: unknown };

export function serve(handlers: Record<string, Handler>, scope: { postMessage(m: unknown): void; addEventListener(t: 'message', cb: (e: MessageEvent) => void): void }) {
  scope.addEventListener('message', async (e: MessageEvent) => {
    const req = e.data as Req;
    if (!req || typeof req.id !== 'number') return;
    try {
      const fn = handlers[req.method];
      if (!fn) throw new Error(`Unknown method ${req.method}`);
      const result = await (fn as (...a: unknown[]) => unknown)(...req.args);
      scope.postMessage({ id: req.id, result });
    } catch (err) {
      scope.postMessage({ id: req.id, error: err instanceof Error ? err.message : String(err) });
    }
  });
  return {
    emit(event: string, payload: unknown) {
      scope.postMessage({ event, payload });
    },
  };
}

export interface RpcClient<M extends Record<string, Handler>> {
  call<K extends keyof M & string>(method: K, ...args: Parameters<M[K]>): Promise<Awaited<ReturnType<M[K]>>>;
  on(event: string, cb: (payload: unknown) => void): () => void;
}

export function client<M extends Record<string, Handler>>(worker: Worker): RpcClient<M> {
  let next = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  const listeners = new Map<string, Set<(p: unknown) => void>>();
  worker.addEventListener('message', (e: MessageEvent) => {
    const msg = e.data as Res;
    if ('event' in msg) {
      for (const cb of listeners.get(msg.event) ?? []) cb(msg.payload);
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error !== undefined) p.reject(new Error(msg.error));
    else p.resolve(msg.result);
  });
  return {
    call(method, ...args) {
      const id = next++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
        worker.postMessage({ id, method, args });
      });
    },
    on(event, cb) {
      const set = listeners.get(event) ?? new Set();
      set.add(cb);
      listeners.set(event, set);
      return () => set.delete(cb);
    },
  };
}
