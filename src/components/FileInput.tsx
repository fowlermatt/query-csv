import type { ChangeEvent } from 'react'

type FileInputProps = {
  onFileSelect: (file: File) => void
}

const FileInput = ({ onFileSelect }: FileInputProps) => {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onFileSelect(file)
      e.currentTarget.value = ''
    }
  }

  return (
    <label style={{ display: 'inline-block', cursor: 'pointer' }}>
      <span style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
        Select a CSV or Parquet file
      </span>
      <input type="file" accept=".csv,.parquet" onChange={handleChange} multiple={false} />
    </label>
  )
}

export default FileInput
