export async function recordCorpus(_opts: { root: string; cacheDir: string }): Promise<void> {
  throw new Error('The query corpus recorder is not implemented yet.');
}

export async function corpusDrift(_opts: { root: string; strict: boolean }): Promise<number> {
  throw new Error('The query corpus drift check is not implemented yet.');
}
