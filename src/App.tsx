import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import FileInput from './components/FileInput'
import ResultsTable from './components/ResultsTable'
import useDuckDB from './hooks/useDuckDBClient'
import Analytics from './components/Analytics'
import useLocalStorage from './hooks/useLocalStorage'

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
  const [sql, setSql] = useState<string>('SELECT * FROM source LIMIT 10;')

  const [history, setHistory] = useLocalStorage<string[]>('qb_history', [])

  useEffect(() => {
    if (isRunning && (queryError !== null || queryExecutionTime !== null)) {
      setIsRunning(false)
    }
  }, [isRunning, queryError, queryExecutionTime])

  const handleFileSelect = useCallback(
    (file: File) => {
      registerFile(file)
    },
    [registerFile]
  )

  const saveQueryToHistory = useCallback(() => {
    const trimmed = sql.trim()
    if (!trimmed) return
    setHistory((prev) => {
      const next = [trimmed, ...prev.filter((q) => q !== trimmed)]
      return next.slice(0, 50)
    })
  }, [sql, setHistory])

  const handleRunQuery = useCallback(() => {
    setIsRunning(true)
    saveQueryToHistory()
    runQuery(sql)
  }, [runQuery, sql, saveQueryToHistory])

  const toCSV = useCallback((rows: Record<string, unknown>[]) => {
    if (!rows || rows.length === 0) return ''
    const headers = Object.keys(rows[0])
    const esc = (v: unknown) => {
      if (v == null) return ''
      const s = String(v)
      const needsWrap = /[",\n]/.test(s)
      const escaped = s.replace(/"/g, '""')
      return needsWrap ? `"${escaped}"` : escaped
    }
    const lines = [
      headers.map(esc).join(','),
      ...rows.map((r) => headers.map((h) => esc((r as any)[h])).join(',')),
    ]
    return lines.join('\n')
  }, [])

  const handleCopyResults = useCallback(async () => {
    try {
      const csv = toCSV(queryResult)
      await navigator.clipboard.writeText(csv)
    } catch (e) {
      alert('Failed to copy to clipboard')
    }
  }, [queryResult, toCSV])

  const handleExportCSV = useCallback(() => {
    const csv = toCSV(queryResult)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'query_results.csv'
    a.click()
    URL.revokeObjectURL(url)
  }, [queryResult, toCSV])

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    const first = queryResult?.[0]
    if (!first) return []
    return Object.keys(first).map((key) => ({
      header: key,
      accessorKey: key,
    }))
  }, [queryResult])

  let content: React.ReactElement

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

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
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

              <button
                type="button"
                onClick={handleCopyResults}
                disabled={!queryResult || queryResult.length === 0}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #ddd',
                  background: '#f8f8f8',
                  cursor: !queryResult || queryResult.length === 0 ? 'not-allowed' : 'pointer',
                  width: 'fit-content',
                }}
                title="Copy results (CSV) to clipboard"
              >
                Copy Results (CSV)
              </button>

              <button
                type="button"
                onClick={handleExportCSV}
                disabled={!queryResult || queryResult.length === 0}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #ddd',
                  background: '#f8f8f8',
                  cursor: !queryResult || queryResult.length === 0 ? 'not-allowed' : 'pointer',
                  width: 'fit-content',
                }}
                title="Download results as CSV"
              >
                Export CSV
              </button>
            </div>

            <style>
              {`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}
            </style>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 16, margin: 0 }}>Query History</h2>
              <button
                type="button"
                onClick={() => setHistory([])}
                disabled={history.length === 0}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid #ddd',
                  background: '#fafafa',
                  cursor: history.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                Clear
              </button>
            </div>
            {history.length === 0 ? (
              <p style={{ color: '#6b7280', marginTop: 6, fontSize: 13 }}>
                No queries yet. Run a query to save it here.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, marginTop: 6, display: 'grid', gap: 6 }}>
                {history.map((q, idx) => (
                  <li key={idx}>
                    <button
                      type="button"
                      onClick={() => setSql(q)}
                      title="Click to load this query"
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid #e5e7eb',
                        background: '#fff',
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                        fontSize: 12,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {q}
                    </button>
                  </li>
                ))}
              </ul>
            )}
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

          {queryResult && (
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

              {queryResult.length > 0 && <ResultsTable columns={columns} data={queryResult} />}
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