/// <reference lib="webworker" />

import * as duckdb from '@duckdb/duckdb-wasm'
import duckdbWasmUrl from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import duckdbBrowserWorkerUrl from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'

import type { TableSchema } from './contracts.ts'


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

    const internalWorker = new Worker(duckdbBrowserWorkerUrl, { type: 'module' })
    const logger = new duckdb.ConsoleLogger()
    db = new duckdb.AsyncDuckDB(logger, internalWorker)
    await db.instantiate(duckdbWasmUrl)

    self.postMessage({ type: 'INIT_SUCCESS' })
  } catch (err) {
    self.postMessage({ type: 'INIT_ERROR', error: String(err) })
  }
})()

async function fetchFullSchema(): Promise<TableSchema[]> {
  if (!db) throw new Error('Database not initialized')
  const conn = await db.connect()
  try {
    const sql = `
      SELECT table_name AS table,
             column_name AS name,
             data_type   AS type,
             is_nullable AS nullable
      FROM information_schema.columns
      WHERE table_schema = 'main'
      ORDER BY table_name, ordinal_position;
    `
    const table = await conn.query(sql)

    const rows: any[] = (table as any)?.toArray ? (table as any).toArray() : (table as any)

    const byTable = new Map<string, TableSchema>()
    for (const r of rows) {
      const t = String(r.table)
      const entry = byTable.get(t) ?? { table: t, columns: [] }
      entry.columns.push({
        name: String(r.name),
        type: String(r.type),
        nullable: String(r.nullable).toLowerCase() === 'yes',
      })
      byTable.set(t, entry)
    }
    return [...byTable.values()]
  } finally {
    try {
      await conn.close()
    } catch {}
  }
}

self.addEventListener('message', async (evt: MessageEvent) => {
  const msg = evt.data
  if (!msg || typeof msg !== 'object') return

  switch (msg.type) {
    case 'REGISTER_FILE': {
      try {
        if (!db) return self.postMessage({ type: 'REGISTER_FAILURE', payload: 'Database not initialized' })
        const file: File | undefined = msg.file
        if (!file) return self.postMessage({ type: 'REGISTER_FAILURE', payload: 'No file provided' })

        const VIRTUAL_NAME = 'source'
        const lower = (file.name || '').toLowerCase()

        if (lower.endsWith('.csv')) {
          const text = await file.text()
          await db.registerFileText(VIRTUAL_NAME, text)
        } else if (lower.endsWith('.parquet')) {
          const buf = new Uint8Array(await file.arrayBuffer())
          await db.registerFileBuffer(VIRTUAL_NAME, buf)
        } else {
          return self.postMessage({
            type: 'REGISTER_FAILURE',
            payload: 'Unsupported file type (only .csv and .parquet)',
          })
        }

        const conn = await db.connect()
        try {
          await conn.query(`DROP VIEW IF EXISTS source`)
          if (lower.endsWith('.csv')) {
            await conn.query(
              `CREATE VIEW source AS SELECT * FROM read_csv_auto('${VIRTUAL_NAME}', header=true)`
            )
          } else {
            await conn.query(
              `CREATE VIEW source AS SELECT * FROM parquet_scan('${VIRTUAL_NAME}')`
            )
          }
        } finally {
          try { await conn.close() } catch {}
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
      if (!sql || typeof sql !== 'string') {
        return self.postMessage({ type: 'QUERY_FAILURE', payload: 'No SQL provided' })
      }

      let conn: duckdb.AsyncDuckDBConnection | null = null
      try {
        console.log('[duckdb.worker] exec start:', sql)
        conn = await db.connect()
        const table = await conn.query(sql)
        console.log('[duckdb.worker] exec got table with rows:', (table as any).numRows ?? 'unknown')

        let sent = false
        try {
          const { tableToIPC, Table: ArrowTable } = await import('apache-arrow')
          let buf: Uint8Array = tableToIPC(
            table as unknown as InstanceType<typeof ArrowTable>,
            'file'
          )
          if (!buf || buf.byteLength === 0) {
            buf = tableToIPC(
              table as unknown as InstanceType<typeof ArrowTable>,
              'stream'
            )
          }

          if (buf && buf.byteLength > 0) {
            console.log('[duckdb.worker] exec posting QUERY_SUCCESS (arrow bytes):', buf.byteLength)
            self.postMessage({ type: 'QUERY_SUCCESS', payload: buf }, [buf.buffer])
            sent = true
          }
        } catch (arrowErr) {
          console.warn('[duckdb.worker] arrow serialize failed, will fall back to JSON:', arrowErr)
        }

        if (!sent) {
          const rows = (table as any).toArray ? (table as any).toArray().map((r: any) => ({ ...r })) : []
          self.postMessage({ type: 'QUERY_SUCCESS_JSON', payload: rows })
        }
      } catch (e: any) {
        console.error('[duckdb.worker] exec error:', e)
        self.postMessage({ type: 'QUERY_FAILURE', payload: e?.message ?? String(e) })
      } finally {
        try { await conn?.close() } catch {}
      }
      break
    }

    case 'GET_SCHEMA': {
      if (!db) return self.postMessage({ type: 'SCHEMA_FAILURE', payload: 'Database not initialized' })
      try {
        const tables = await fetchFullSchema()
        self.postMessage({ type: 'SCHEMA_SUCCESS', payload: tables })
      } catch (e: any) {
        self.postMessage({ type: 'SCHEMA_FAILURE', payload: e?.message ?? String(e) })
      }
      break
    }

    default:
      break
  }
})
