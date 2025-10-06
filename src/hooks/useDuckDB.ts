import { useEffect, useRef, useState } from 'react'

export type DbStatus = 'idle' | 'initializing' | 'ready' | 'error'
export type FileStatus = 'idle' | 'registering' | 'ready' | 'error'

type UseDuckDBReturn = {
  status: DbStatus
  fileStatus: FileStatus
  worker: Worker | null
  registerFile: (file: File) => void
}

export function useDuckDB(): UseDuckDBReturn {
  const [status, setStatus] = useState<DbStatus>('idle')
  const [fileStatus, setFileStatus] = useState<FileStatus>('idle')
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => {
    setStatus('initializing')

    const worker = new Worker(new URL('../workers/duckdb.worker.ts', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker

    worker.onmessage = (evt: MessageEvent) => {
      const msg = evt.data
      switch (msg?.type) {
        case 'INIT_SUCCESS':
          setStatus('ready')
          break
        case 'INIT_ERROR':
          setStatus('error')
          break
        case 'REGISTER_SUCCESS':
          setFileStatus('ready')
          break
        case 'REGISTER_FAILURE':
          setFileStatus('error')
          break
        default:
          break
      }
    }

    worker.onerror = () => setStatus('error')

    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

  const registerFile = (file: File) => {
    if (!workerRef.current) return
    setFileStatus('registering')
    workerRef.current.postMessage({ type: 'REGISTER_FILE', file })
  }

  return { status, fileStatus, worker: workerRef.current, registerFile }
}

export default useDuckDB
