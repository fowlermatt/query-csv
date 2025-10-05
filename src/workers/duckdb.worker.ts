import * as duckdb from '@duckdb/duckdb-wasm'

let db: duckdb.AsyncDuckDB | null = null

;(async () => {
  try {
    const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles()

    const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES)

    const workerUrl = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker!}");`], { type: 'text/javascript' })
    )
    const duckWorker = new Worker(workerUrl)
    URL.revokeObjectURL(workerUrl)

    const logger = new duckdb.ConsoleLogger()
    db = new duckdb.AsyncDuckDB(logger, duckWorker)
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker)

    postMessage({ type: 'INIT_SUCCESS' })
  } catch (err) {
    console.error('[duckdb.worker] init error:', err)
    postMessage({ type: 'INIT_ERROR', error: String(err) })
  }
})()

self.addEventListener('message', (evt: MessageEvent) => {
  console.log('[duckdb.worker] message from main thread:', evt.data)
})


/*
const worker = new Worker(new URL('./workers/duckdb.worker.ts', import.meta.url), {
  type: 'module',
})
worker.onmessage = (e) => console.log('worker says:', e.data)
*/