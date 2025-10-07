import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import FileInput from './components/FileInput'
import ResultsTable from './components/ResultsTable'
import useDuckDB from './hooks/useDuckDBClient'
import Analytics from './components/Analytics'
import type { ReactElement } from 'react'

function App() {
  const {
    status,
    fileStatus,
    registerFile,
    runQuery,
    queryResult,
    queryError,
    queryExecutionTime,
  } = useDuckDB()

  const [isRunning, setIsRunning] = useState(false)

  useEffect(() => {
    if (isRunning && (queryResult.length > 0 || queryError !== null)) {
      setIsRunning(false)
    }
  }, [isRunning, queryResult, queryError])

  const [sql, setSql] = useState<string>('SELECT * FROM source LIMIT 10;')

  const handleFileSelect = useCallback(
    (file: File) => {
      registerFile(file)
    },
    [registerFile]
  )

  const handleRunQuery = useCallback(() => {
    setIsRunning(true)
    runQuery(sql)
  }, [runQuery, sql])

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    const first = queryResult?.[0]
    if (!first) return []
    return Object.keys(first).map((key) => ({
      header: key,
      accessorKey: key,
    }))
  }, [queryResult])

  let content: ReactElement

  if (status === 'initializing') {
    content = (
      <main
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif',
          padding: 24,
        }}
      >
        <div style={{ textAlign: 'center', color: '#374151' }}>
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              border: '3px solid #e5e7eb',
              borderTopColor: '#6b7280',
              margin: '0 auto 12px',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <p style={{ fontWeight: 600 }}>Initializing Database...</p>
          <style>
            {`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}
          </style>
        </div>
      </main>
    )
  } else if (fileStatus !== 'ready') {
    content = (
      <main
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif',
          padding: 24,
        }}
      >
        <div style={{ width: 'min(900px, 92vw)', textAlign: 'center' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: 8 }}>QueryBox: Instant SQL on Local Files</h1>
          <p style={{ color: '#4b5563', marginBottom: 20 }}>
            Fast, private, and secure. Your data never leaves your browser.
          </p>

          <div style={{ display: 'inline-block', textAlign: 'left' }}>
            <FileInput onFileSelect={handleFileSelect} />
            {fileStatus === 'registering' && (
              <div style={{ marginTop: 8, color: '#374151', fontSize: 14 }}>Loading file…</div>
            )}
            {fileStatus === 'error' && (
              <div
                role="alert"
                style={{
                  marginTop: 12,
                  padding: 10,
                  borderRadius: 8,
                  border: '1px solid #dc2626',
                  background: '#fff1f2',
                  color: '#b91c1c',
                  fontWeight: 600,
                }}
              >
                Could not load file. Please try again.
              </div>
            )}
          </div>
        </div>
      </main>
    )
  } else {
    content = (
      <main
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif',
          padding: 24,
        }}
      >
        <div style={{ width: 'min(1100px, 94vw)' }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: 8 }}>In-browser Query Tool</h1>

          <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
            <label>
              <span style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>SQL Query</span>
              <textarea
                value={sql}
                onChange={(e) => setSql(e.target.value)}
                placeholder="Write a SQL query…"
                rows={8}
                style={{
                  width: '100%',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  fontSize: 14,
                  padding: 12,
                }}
              />
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                type="button"
                onClick={handleRunQuery}
                disabled={isRunning || status !== 'ready'}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #ddd',
                  background: isRunning ? '#eee' : '#f8f8f8',
                  cursor: isRunning ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  width: 'fit-content',
                  opacity: isRunning ? 0.7 : 1,
                }}
              >
                {isRunning ? 'Running…' : 'Run Query'}
              </button>

              {isRunning && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#374151' }}>
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      border: '3px solid #e5e7eb',
                      borderTopColor: '#6b7280',
                      animation: 'spin 0.8s linear infinite',
                    }}
                  />
                  <span>Running query...</span>
                </div>
              )}
            </div>

            <style>
              {`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}
            </style>
          </div>

          {queryError && (
            <div
              role="alert"
              style={{
                marginTop: 16,
                padding: 12,
                borderRadius: 8,
                border: '1px solid #dc2626',
                background: '#fff1f2',
                color: '#b91c1c',
                fontWeight: 600,
              }}
            >
              <div style={{ marginBottom: 4 }}>Query Error</div>
              <div style={{ fontWeight: 400 }}>{queryError}</div>
            </div>
          )}

          {queryResult && queryResult.length > 0 && (
            <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
              <div style={{ fontSize: 14, color: '#374151' }}>
                <strong>Rows:</strong> {queryResult.length}
                {typeof queryExecutionTime === 'number' && (
                  <>
                    {'  ·  '}
                    <strong>Execution Time:</strong> {queryExecutionTime.toFixed(2)} ms
                  </>
                )}
              </div>

              <ResultsTable columns={columns} data={queryResult} />
            </div>
          )}
        </div>
      </main>
    )
  }

  return (
    <>
      <Analytics />
      {content}
    </>
  )
}

export default App
