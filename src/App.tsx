import { useCallback, useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import FileInput from './components/FileInput'
import ResultsTable from './components/ResultsTable'
import useDuckDBClient from './hooks/useDuckDBClient'
function App() {
  const {
    status,
    fileStatus,
    registerFile,
    runQuery,
    queryResult,
    queryError,
    queryExecutionTime,
  } = useDuckDBClient()

  const [sql, setSql] = useState<string>('SELECT * FROM source LIMIT 10;')

  const handleFileSelect = useCallback(
    (file: File) => {
      registerFile(file)
    },
    [registerFile]
  )

  const handleRunQuery = useCallback(() => {
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

  return (
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

        <p>
          <strong>Database Status:</strong> {status}
        </p>
        <p>
          <strong>File Registration:</strong> {fileStatus}
        </p>

        <div style={{ marginTop: 12 }}>
          <FileInput onFileSelect={handleFileSelect} />
        </div>

        {fileStatus === 'ready' && (
          <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
            <label>
              <span style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
                SQL Query
              </span>
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

            <button
              type="button"
              onClick={handleRunQuery}
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #ddd',
                background: '#f8f8f8',
                cursor: 'pointer',
                fontWeight: 600,
                width: 'fit-content',
              }}
            >
              Run Query
            </button>
          </div>
        )}

        {/* Error display */}
        {queryError && (
          <div
            style={{
              marginTop: 16,
              color: '#b91c1c',
              background: '#fee2e2',
              border: '1px solid #fecaca',
              padding: 12,
              borderRadius: 8,
            }}
          >
            <strong>Error:</strong> {queryError}
          </div>
        )}

        {/* Results */}
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

export default App
