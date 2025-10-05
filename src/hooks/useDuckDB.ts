import { useEffect, useRef, useState } from 'react'

type DbStatus = 'idle' | 'initializing' | 'ready' | 'error'

export function useDuckDB(): DbStatus {
  const [status, setStatus] = useState<DbStatus>('idle')
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => {
    setStatus('initializing')

    const worker = new Worker(new URL('../workers/duckdb.worker.ts', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker

    worker.onmessage = (evt: MessageEvent) => {
      const msg = evt.data
      if (msg?.type === 'INIT_SUCCESS') {
        setStatus('ready')
      } else if (msg?.type === 'INIT_ERROR') {
        setStatus('error')
      }
    }

    worker.onerror = () => {
      setStatus('error')
    }

    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

  return status
}

export default useDuckDB
