import { useEffect, useMemo, useRef, useState } from 'react'
import { tableFromIPC } from 'apache-arrow'

type DbStatus = 'idle' | 'initializing' | 'ready' | 'error'
type FileStatus = 'idle' | 'registering' | 'ready' | 'error'

const QUERY_TIMEOUT_MS = 20000

type TableColumn = { name: string; type: string; nullable?: boolean }
type TableSchema = { table: string; columns: TableColumn[] }

export default function useDuckDBClient() {
  const [status, setStatus] = useState<DbStatus>('idle')
  const [fileStatus, setFileStatus] = useState<FileStatus>('idle')

  const [queryResult, setQueryResult] = useState<Record<string, unknown>[]>([])
  const [queryError, setQueryError] = useState<string | null>(null)
  const [queryExecutionTime, setQueryExecutionTime] = useState<number | null>(null)

  const [schema, setSchema] = useState<TableSchema[]>([])
  const [schemaError, setSchemaError] = useState<string | null>(null)

  const workerRef = useRef<Worker | null>(null)
  const queryStartRef = useRef<number | null>(null)
  const queryTimerRef = useRef<number | null>(null)

  useEffect(() => {
    setStatus('initializing')

    const worker = new Worker(new URL('../workers/duckdb.worker.ts', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker

    const watchdog = setTimeout(() => {
      setStatus((prev) => (prev === 'initializing' ? 'error' : prev))
    }, 15000)

    worker.onmessage = (evt: MessageEvent) => {
      const msg = evt.data

      if (msg?.type === 'QUERY_SUCCESS' || msg?.type === 'QUERY_FAILURE' || msg?.type === 'QUERY_SUCCESS_JSON') {
        if (queryTimerRef.current) {
          window.clearTimeout(queryTimerRef.current)
          queryTimerRef.current = null
        }
      }

      switch (msg?.type) {
        case 'INIT_SUCCESS': {
          clearTimeout(watchdog)
          setStatus('ready')
          // NEW: fetch initial schema snapshot
          workerRef.current?.postMessage({ type: 'GET_SCHEMA' })
          break
        }
        case 'INIT_ERROR': {
          clearTimeout(watchdog)
          setStatus('error')
          break
        }

        case 'REGISTER_SUCCESS': {
          setFileStatus('ready')
          // NEW: refresh schema shortly after registering file/view
          setTimeout(() => workerRef.current?.postMessage({ type: 'GET_SCHEMA' }), 50)
          break
        }
        case 'REGISTER_FAILURE': {
          setFileStatus('error')
          break
        }

        case 'SCHEMA_SUCCESS': {
          // NEW: handle schema
          const tables = Array.isArray(msg.payload) ? (msg.payload as TableSchema[]) : []
          setSchema(tables)
          setSchemaError(null)
          break
        }
        case 'SCHEMA_FAILURE': {
          setSchema([])
          setSchemaError(typeof msg?.payload === 'string' ? msg.payload : 'Failed to load schema')
          break
        }

        case 'QUERY_SUCCESS': {
          const end = performance.now()
          const start = queryStartRef.current ?? end
          setQueryExecutionTime(end - start)
          queryStartRef.current = null

          try {
            const arrowBuffer: Uint8Array =
              msg.payload instanceof Uint8Array ? msg.payload : new Uint8Array(msg.payload)

            const table = tableFromIPC(arrowBuffer)
            const rows: Record<string, unknown>[] = []
            for (let i = 0; i < table.numRows; i++) {
              rows.push(table.get(i)!.toJSON())
            }

            setQueryResult(rows)
            setQueryError(null)
          } catch (e: any) {
            setQueryError(e?.message ?? String(e))
            setQueryResult([])
          }
          break
        }

        case 'QUERY_SUCCESS_JSON': {
          const end = performance.now()
          const start = queryStartRef.current ?? end
          setQueryExecutionTime(end - start)
          queryStartRef.current = null

          const rows = Array.isArray(msg.payload) ? (msg.payload as Record<string, unknown>[]) : []
          setQueryResult(rows)
          setQueryError(null)
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
          break
      }
    }

    worker.onerror = (e) => {
      clearTimeout(watchdog)
      console.error('[useDuckDBClient] worker error', e)
      setStatus('error')
    }

    return () => {
      clearTimeout(watchdog)
      if (queryTimerRef.current) clearTimeout(queryTimerRef.current)
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

  const registerFile = (file: File) => {
    if (!workerRef.current) return
    setFileStatus('registering')
    workerRef.current.postMessage({ type: 'REGISTER_FILE', file })
  }

  const runQuery = (sql: string) => {
    if (!workerRef.current) return

    setQueryError(null)
    setQueryResult([])
    setQueryExecutionTime(null)
    queryStartRef.current = performance.now()

    if (queryTimerRef.current) window.clearTimeout(queryTimerRef.current)

    queryTimerRef.current = window.setTimeout(() => {
      setQueryError('Query timed out')
      const end = performance.now()
      setQueryExecutionTime(end - (queryStartRef.current ?? end))
      queryStartRef.current = null
    }, QUERY_TIMEOUT_MS)

    workerRef.current.postMessage({ type: 'EXECUTE_QUERY', payload: sql })
  }

  const getSchema = () => workerRef.current?.postMessage({ type: 'GET_SCHEMA' })

  const tableNames = useMemo(() => schema.map(s => s.table), [schema])
  const columnNames = useMemo(
    () => [...new Set(schema.flatMap(s => s.columns.map(c => c.name)))],
    [schema]
  )

  return {
    // existing
    status,
    fileStatus,
    registerFile,
    runQuery,
    queryResult,
    queryError,
    queryExecutionTime,

    // new
    schema,
    schemaError,
    getSchema,
    tableNames,
    columnNames,
  }
}
