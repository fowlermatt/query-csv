import { useEffect, useRef, useState } from 'react'
import { tableFromIPC } from 'apache-arrow'

type DbStatus = 'idle' | 'initializing' | 'ready' | 'error'
type FileStatus = 'idle' | 'registering' | 'ready' | 'error'

export default function useDuckDB() {
  const [status, setStatus] = useState<DbStatus>('idle')
  const [fileStatus, setFileStatus] = useState<FileStatus>('idle')
  const [queryResult, setQueryResult] = useState<Record<string, unknown>[]>([])
  const [queryError, setQueryError] = useState<string | null>(null)
  const [queryExecutionTime, setQueryExecutionTime] = useState<number | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const queryStartRef = useRef<number | null>(null)

  useEffect(() => {
    setStatus('initializing')
    
    const worker = new Worker(
      new URL('../workers/duckdb.worker.ts', import.meta.url),
      { type: 'module' }
    )
    
    workerRef.current = worker

    const watchdog = setTimeout(() => {
      console.error('DuckDB worker initialization timeout')
      setStatus('error')
    }, 15000)

    worker.onmessage = (evt: MessageEvent) => {
      const msg = evt.data

      switch (msg?.type) {
        case 'INIT_SUCCESS':
          clearTimeout(watchdog)
          setStatus('ready')
          break

        case 'INIT_ERROR':
          clearTimeout(watchdog)
          setStatus('error')
          console.error('DuckDB init error:', msg?.error)
          break

        case 'REGISTER_SUCCESS':
          setFileStatus('ready')
          break

        case 'REGISTER_FAILURE':
          setFileStatus('error')
          console.error('File registration error:', msg?.error)
          break

        case 'QUERY_SUCCESS': {
          const end = performance.now()
          const start = queryStartRef.current ?? end
          setQueryExecutionTime(end - start)
          queryStartRef.current = null

          try {
            const arrowBuffer: Uint8Array =
              msg.payload instanceof Uint8Array
                ? msg.payload
                : new Uint8Array(msg.payload)
            
            const table = tableFromIPC(arrowBuffer)
            const numRows = table.numRows
            const numCols = table.numCols
            const columns = Array.from({ length: numCols }, (_, ci) =>
              table.getChildAt(ci)
            )
            const fieldNames = table.schema.fields.map(
              (f, ci) => f?.name ?? `col_${ci}`
            )

            const rows: Record<string, unknown>[] = []
            for (let i = 0; i < numRows; i++) {
              const obj: Record<string, unknown> = {}
              for (let c = 0; c < numCols; c++) {
                const col = columns[c]
                obj[fieldNames[c]] = col ? col.get(i) : undefined
              }
              rows.push(obj)
            }

            setQueryResult(rows)
            setQueryError(null)
          } catch (e: unknown) {
            const errorMsg = e instanceof Error ? e.message : String(e)
            setQueryError(errorMsg)
            setQueryResult([])
          }
          break
        }

        case 'QUERY_FAILURE': {
          const end = performance.now()
          const start = queryStartRef.current ?? end
          setQueryExecutionTime(end - start)
          queryStartRef.current = null
          
          setQueryError(
            typeof msg?.payload === 'string' ? msg.payload : 'Query failed'
          )
          setQueryResult([])
          break
        }

        default:
          break
      }
    }

    worker.onerror = (error) => {
      clearTimeout(watchdog)
      console.error('Worker error:', error)
      setStatus('error')
    }

    return () => {
      clearTimeout(watchdog)
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

  const registerFile = (file: File) => {
    if (!workerRef.current) {
      console.warn('Worker not ready')
      return
    }
    setFileStatus('registering')
    workerRef.current.postMessage({ type: 'REGISTER_FILE', file })
  }

  const runQuery = (sql: string) => {
    if (!workerRef.current) {
      console.warn('Worker not ready')
      return
    }
    setQueryError(null)
    setQueryResult([])
    setQueryExecutionTime(null)
    queryStartRef.current = performance.now()
    workerRef.current.postMessage({ type: 'EXECUTE_QUERY', payload: sql })
  }

  return {
    status,
    fileStatus,
    worker: workerRef.current,
    registerFile,
    queryResult,
    queryError,
    queryExecutionTime,
    runQuery,
  }
}