/// <reference lib="webworker" />

import * as duckdb from '@duckdb/duckdb-wasm'
import { tableToIPC, Table as ArrowTable } from 'apache-arrow'

import duckdbWasmUrl from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import duckdbBrowserWorkerUrl from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url&inline'
let db: duckdb.AsyncDuckDB | null = null

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

    const internalWorker = new Worker(duckdbBrowserWorkerUrl)

    const logger = new duckdb.ConsoleLogger()
    db = new duckdb.AsyncDuckDB(logger, internalWorker)

    await db.instantiate(duckdbWasmUrl)

    self.postMessage({ type: 'INIT_SUCCESS' })
  } catch (err) {
    self.postMessage({ type: 'INIT_ERROR', error: String(err) })
  }
})()

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
        const nameLower = (file.name || '').toLowerCase()

        if (nameLower.endsWith('.csv')) {
          const text = await file.text()
          await db.registerFileText(VIRTUAL_NAME, text)
        } else if (nameLower.endsWith('.parquet')) {
          const buf = new Uint8Array(await file.arrayBuffer())
          await db.registerFileBuffer(VIRTUAL_NAME, buf)
        } else {
          self.postMessage({
            type: 'REGISTER_FAILURE',
            payload: 'Unsupported file type (only .csv and .parquet)',
          })
          return
        }

        self.postMessage({ type: 'REGISTER_SUCCESS' })
      } catch (e: any) {
        self.postMessage({ type: 'REGISTER_FAILURE', payload: e?.message ?? String(e) })
      }
      break
    }

    case 'EXECUTE_QUERY': {
      if (!db) {
        self.postMessage({ type: 'QUERY_FAILURE', payload: 'Database not initialized' })
        return
      }
      const sql: string | undefined = msg.payload
      if (!sql || typeof sql !== 'string') {
        self.postMessage({ type: 'QUERY_FAILURE', payload: 'No SQL provided' })
        return
      }

      let conn: duckdb.AsyncDuckDBConnection | null = null
      try {
        conn = await db.connect()

        const duckdbTable = await conn.query(sql)
        const arrowBuffer: Uint8Array = tableToIPC(
          duckdbTable as unknown as ArrowTable,
          'stream'
        )

        self.postMessage({ type: 'QUERY_SUCCESS', payload: arrowBuffer }, [arrowBuffer.buffer])
      } catch (e: any) {
        self.postMessage({ type: 'QUERY_FAILURE', payload: e?.message ?? String(e) })
      } finally {
        try {
          await conn?.close()
        } catch {
        }
      }
      break
    }

    default:
      break
  }
})
