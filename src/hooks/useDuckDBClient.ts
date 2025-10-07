// src/hooks/useDuckDBClient.ts
import { useEffect, useRef, useState } from 'react'
import { tableFromIPC } from 'apache-arrow'

type DbStatus = 'idle' | 'initializing' | 'ready' | 'error'
type FileStatus = 'idle' | 'registering' | 'ready' | 'error'

export default function useDuckDBClient() {
  const [status, setStatus] = useState<DbStatus>('idle')
  const [fileStatus, setFileStatus] = useState<FileStatus>('idle')

  const [queryResult, setQueryResult] = useState<Record<string, unknown>[]>([])
  const [queryError, setQueryError] = useState<string | null>(null)
  const [queryExecutionTime, setQueryExecutionTime] = useState<number | null>(null)

  const workerRef = useRef<Worker | null>(null)
  const queryStartRef = useRef<number | null>(null)

  useEffect(() => {
    setStatus('initializing')

    // Create the DuckDB worker (module worker that imports our dedicated worker file)
    const worker = new Worker(new URL('../workers/duckdb.worker.ts', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker

    // Fail-fast watchdog so the UI doesn't spin forever
    const watchdog = setTimeout(() => {
      setStatus((prev) => (prev === 'initializing' ? 'error' : prev))
    }, 15000)

    worker.onmessage = (evt: MessageEvent) => {
      const msg = evt.data
      switch (msg?.type) {
        // ---- Boot status ----
        case 'INIT_SUCCESS':
          clearTimeout(watchdog)
          setStatus('ready')
          break
        case 'INIT_ERROR':
          clearTimeout(watchdog)
          setStatus('error')
          break

        // ---- File registration ----
        case 'REGISTER_SUCCESS':
          setFileStatus('ready')
          break
        case 'REGISTER_FAILURE':
          setFileStatus('error')
          break

        // ---- Query results ----
        case 'QUERY_SUCCESS': {
          const end = performance.now()
          const start = queryStartRef.current ?? end
          setQueryExecutionTime(end - start)
          queryStartRef.current = null

          try {
            // msg.payload is a transferred Uint8Array (Arrow IPC stream)
            const arrowBuffer: Uint8Array =
              msg.payload instanceof Uint8Array ? msg.payload : new Uint8Array(msg.payload)

            const table = tableFromIPC(arrowBuffer)
            const numRows = table.numRows
            const numCols = table.numCols

            // Vector references and field names from schema
            const vectors = Array.from({ length: numCols }, (_, i) => table.getChildAt(i))
            const fieldNames = table.schema.fields.map((f, i) => f?.name ?? `col_${i}`)

            const rows: Record<string, unknown>[] = []
            for (let r = 0; r < numRows; r++) {
              const obj: Record<string, unknown> = {}
              for (let c = 0; c < numCols; c++) {
                const v = vectors[c]
                obj[fieldNames[c]] = v ? v.get(r) : undefined
              }
              rows.push(obj)
            }

            setQueryResult(rows)
            setQueryError(null)
          } catch (e: any) {
            setQueryError(e?.message ?? String(e))
            setQueryResult([])
          }
          break
        }

        case 'QUERY_FAILURE': {
          const end = performance.now()
          const start = queryStartRef.current ?? end
          setQueryExecutionTime(end - start)
          queryStartRef.current = null

          setQueryError(typeof msg?.payload === 'string' ? msg.payload : 'Query failed')
          setQueryResult([])
          break
        }

        default:
          // no-op
          break
      }
    }

    worker.onerror = (e) => {
      clearTimeout(watchdog)
      // Surface any boot error
      // eslint-disable-next-line no-console
      console.error('[useDuckDBClient] worker error', e)
      setStatus('error')
    }

    return () => {
      clearTimeout(watchdog)
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

  // ---- API exposed to components ----

  const registerFile = (file: File) => {
    if (!workerRef.current) return
    setFileStatus('registering')
    workerRef.current.postMessage({ type: 'REGISTER_FILE', file })
  }

  const runQuery = (sql: string) => {
    if (!workerRef.current) return
    // Clear prior query state
    setQueryError(null)
    setQueryResult([])
    setQueryExecutionTime(null)

    // Start timing
    queryStartRef.current = performance.now()

    // Fire to worker
    workerRef.current.postMessage({ type: 'EXECUTE_QUERY', payload: sql })
  }

  return {
    // statuses
    status,
    fileStatus,

    // worker handle (optional external use)
    worker: workerRef.current,

    // actions
    registerFile,
    runQuery,

    // query state
    queryResult,
    queryError,
    queryExecutionTime,
  }
}
