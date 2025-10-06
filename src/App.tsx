import { useCallback } from 'react'
import useDuckDB from './hooks/useDuckDB'
import FileInput from './components/FileInput'

function App() {
  const { status, fileStatus, registerFile } = useDuckDB()

  const handleFileSelect = useCallback(
    (file: File) => {
      registerFile(file)
    },
    [registerFile]
  )

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
      <div>
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
      </div>
    </main>
  )
}

export default App
