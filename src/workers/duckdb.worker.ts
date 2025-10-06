
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

self.addEventListener('message', async (evt: MessageEvent) => {
  const msg = evt.data
  if (!msg || typeof msg !== 'object') {
    console.log('[duckdb.worker] message from main thread (unrecognized):', msg)
    return
  }

  switch (msg.type) {
    case 'REGISTER_FILE': {
      try {
        if (!db) {
          postMessage({ type: 'REGISTER_FAILURE', payload: 'Database not initialized' })
          return
        }
        const file: File | undefined = msg.file
        if (!file) {
          postMessage({ type: 'REGISTER_FAILURE', payload: 'No file provided' })
          return
        }

        const VIRTUAL_NAME = 'source'
        const nameLower = (file.name || '').toLowerCase()

        if (nameLower.endsWith('.csv')) {
          const text = await file.text()
          await db.registerFileText(VIRTUAL_NAME, text)
        } else if (nameLower.endsWith('.parquet')) {
          const buffer = new Uint8Array(await file.arrayBuffer())
          await db.registerFileBuffer(VIRTUAL_NAME, buffer)
        } else {
          postMessage({
            type: 'REGISTER_FAILURE',
            payload: 'Unsupported file type (only .csv and .parquet)',
          })
          return
        }

        postMessage({ type: 'REGISTER_SUCCESS' })
      } catch (e: any) {
        postMessage({ type: 'REGISTER_FAILURE', payload: e?.message ?? String(e) })
      }
      break
    }

    default:
      console.log('[duckdb.worker] message from main thread:', msg)
  }
})
