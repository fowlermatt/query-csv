/// <reference lib="webworker" />

import * as duckdb from '@duckdb/duckdb-wasm'

import duckdbWasmUrl from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import duckdbBrowserWorkerUrl from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'

let db: duckdb.AsyncDuckDB | null = null

// Initialize the DuckDB worker
;(async () => {
  try {
    const head = await fetch(duckdbWasmUrl, { method: 'HEAD' })
    if (!head.ok) {
      self.postMessage({
        type: 'INIT_ERROR',
        error: `WASM not reachable (${head.status}) at ${duckdbWasmUrl}`,
      })
      return
    }

    const internalWorker = new Worker(duckdbBrowserWorkerUrl, { type: 'module' })

    const logger = new duckdb.ConsoleLogger()
    db = new duckdb.AsyncDuckDB(logger, internalWorker)

    await db.instantiate(duckdbWasmUrl)

    self.postMessage({ type: 'INIT_SUCCESS' })
  } catch (err) {
    self.postMessage({ type: 'INIT_ERROR', error: String(err) })
  }
})()

// Listen for messages from the main thread
self.addEventListener('message', async (evt: MessageEvent) => {
  const msg = evt.data
  if (!msg || typeof msg !== 'object') return

  switch (msg.type) {
    case 'REGISTER_FILE': {
      try {
        if (!db) {
          self.postMessage({ type: 'REGISTER_FAILURE', payload: 'Database not initialized' })
          return
        }
        const file: File | undefined = msg.file
        if (!file) {
          self.postMessage({ type: 'REGISTER_FAILURE', payload: 'No file provided' })
          return
        }

        const VIRTUAL_NAME = 'source'
        const lower = (file.name || '').toLowerCase()

        if (lower.endsWith('.csv')) {
          const text = await file.text()
          await db.registerFileText(VIRTUAL_NAME, text)
        } else if (lower.endsWith('.parquet')) {
          const buf = new Uint8Array(await file.arrayBuffer())
          await db.registerFileBuffer(VIRTUAL_NAME, buf)
        } else {
          self.postMessage({
            type: 'REGISTER_FAILURE',
            payload: 'Unsupported file type (only .csv and .parquet)',
          })
          return
        }

        const conn = await db.connect()
        try {
          if (lower.endsWith('.csv')) {
            await conn.query(`
              DROP VIEW IF EXISTS source;
              CREATE VIEW source AS
              SELECT * FROM read_csv_auto('${VIRTUAL_NAME}', header=true);
            `)
          } else {
            await conn.query(`
              DROP VIEW IF EXISTS source;
              CREATE VIEW source AS
              SELECT * FROM parquet_scan('${VIRTUAL_NAME}');
            `)
          }
        } finally {
          await conn.close()
        }

        self.postMessage({ type: 'REGISTER_SUCCESS' })
      } catch (e: any) {
        self.postMessage({ type: 'REGISTER_FAILURE', payload: e?.message ?? String(e) })
      }
      break
    }

    case 'EXECUTE_QUERY': {
      if (!db) return self.postMessage({ type: 'QUERY_FAILURE', payload: 'Database not initialized' })
      const sql: string | undefined = msg.payload
      if (!sql) return self.postMessage({ type: 'QUERY_FAILURE', payload: 'No SQL provided' })

      let conn: duckdb.AsyncDuckDBConnection | null = null
      try {
        console.log('[duckdb.worker] exec start:', sql)
        conn = await db.connect()
        const table = await conn.query(sql)
        console.log('[duckdb.worker] exec got table with rows:', table.numRows)

        try {
          const { tableToIPC, Table: ArrowTable } = await import('apache-arrow')
          const buf: Uint8Array = tableToIPC(table as unknown as InstanceType<typeof ArrowTable>, 'stream')
          console.log('[duckdb.worker] exec posting QUERY_SUCCESS (arrow bytes):', buf.byteLength)
          self.postMessage({ type: 'QUERY_SUCCESS', payload: buf }, [buf.buffer])
        } catch (arrowErr: any) {
          console.warn('[duckdb.worker] arrow serialize failed, falling back to JSON:', arrowErr)
          const rows = table.toArray().map((r: any) => ({ ...r }))
          self.postMessage({ type: 'QUERY_SUCCESS_JSON', payload: rows })
        }
      } catch (e: any) {
        console.error('[duckdb.worker] exec error:', e)
        self.postMessage({ type: 'QUERY_FAILURE', payload: e?.message ?? String(e) })
      } finally {
        try {
          await conn?.close()
        } catch {}
      }
      break
    }

    default:
      break
  }
})