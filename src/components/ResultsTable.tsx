import { useMemo, useRef } from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'

type ResultsTableProps<T extends object> = {
  columns: ColumnDef<T, any>[]
  data: T[]
  rowEstimate?: number
  overscan?: number
}


function ResultsTable<T extends object>({
  columns,
  data,
  rowEstimate = 36,
  overscan = 10,
}: ResultsTableProps<T>) {
  const table = useReactTable<T>({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const parentRef = useRef<HTMLDivElement | null>(null)

  const rowVirtualizer = useVirtualizer({
    count: table.getRowModel().rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowEstimate,
    overscan,
  })

  const virtualItems = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()

  const headerGroups = useMemo(() => table.getHeaderGroups(), [table])

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 1,
          background: '#f9fafb',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        {headerGroups.map((headerGroup) => (
          <div
            key={headerGroup.id}
            style={{
              display: 'grid',
              gridTemplateColumns: headerGroup.headers
                .map((h) => `${h.getSize() || 1}fr`)
                .join(' '),
              gap: 0,
              padding: '8px 12px',
              fontWeight: 600,
              fontSize: 12,
              color: '#111827',
            }}
          >
            {headerGroup.headers.map((header) => (
              <div key={header.id} style={{ whiteSpace: 'nowrap' }}>
                {header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext())}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div
        ref={parentRef}
        style={{
          height: 400,
          overflow: 'auto',
          position: 'relative',
          fontSize: 13,
          lineHeight: 1.4,
        }}
      >
        <div
          style={{
            height: totalSize,
            position: 'relative',
            width: '100%',
          }}
        >
          {virtualItems.map((virtualRow) => {
            const row = table.getRowModel().rows[virtualRow.index]
            return (
              <div
                key={row.id}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                  borderBottom: '1px solid #f3f4f6',
                  background: virtualRow.index % 2 ? '#fff' : '#fcfcfc',
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: row.getVisibleCells()
                      .map((c) => `${c.column.getSize() || 1}fr`)
                      .join(' '),
                    gap: 0,
                    padding: '8px 12px',
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <div key={cell.id} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default ResultsTable
