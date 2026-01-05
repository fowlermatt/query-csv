/// <reference lib="webworker" />

import * as duckdb from '@duckdb/duckdb-wasm'

import type { TableSchema } from './contracts.ts'

// Manual bundles pointing to local files served from public/duckdb-wasm
const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: '/duckdb-wasm/duckdb-mvp.wasm',
    mainWorker: '/duckdb-wasm/duckdb-browser-mvp.worker.js',
  },
  eh: {
    mainModule: '/duckdb-wasm/duckdb-eh.wasm',
    mainWorker: '/duckdb-wasm/duckdb-browser-eh.worker.js',
  },
}

let db: duckdb.AsyncDuckDB | null = null
let wasmBlobUrl: string | null = null

async function fetchWithProgress(url: string): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }

  const contentLength = response.headers.get('Content-Length')
  const total = contentLength ? parseInt(contentLength, 10) : 0

  if (!response.body) {
    // Fallback if ReadableStream not available
    const blob = await response.blob()
    self.postMessage({ type: 'INIT_PROGRESS', payload: 100 })
    return blob
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    chunks.push(value)
    received += value.length

    if (total > 0) {
      const progress = Math.round((received / total) * 100)
      self.postMessage({ type: 'INIT_PROGRESS', payload: progress })
    }
  }

  // Combine chunks into a single Uint8Array
  const combined = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.length
  }

  return new Blob([combined], { type: 'application/wasm' })
}

;(async () => {
  try {
    // Select the best bundle for the current browser
    const bundle = await duckdb.selectBundle(MANUAL_BUNDLES)

    const mainModuleUrl = bundle.mainModule
    const mainWorkerUrl = bundle.mainWorker!

    // Fetch WASM with progress reporting
    self.postMessage({ type: 'INIT_PROGRESS', payload: 0 })
    const wasmBlob = await fetchWithProgress(mainModuleUrl)
    wasmBlobUrl = URL.createObjectURL(wasmBlob)

    const internalWorker = new Worker(mainWorkerUrl, { type: 'module' })
    const logger = new duckdb.ConsoleLogger()
    db = new duckdb.AsyncDuckDB(logger, internalWorker)
    await db.instantiate(wasmBlobUrl)

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
