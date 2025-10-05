import useDuckDB from './hooks/useDuckDB'

function App() {
  const status = useDuckDB()

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif',
      }}
    >
      <div>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>In-browser Query Tool</h1>
        <p>
          <strong>Database Status:</strong> {status}
        </p>
      </div>
    </main>
  )
}

export default App
