import { useMemo, useRef } from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import './ResultsTable.css';

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
  const headerGroups = table.getHeaderGroups();

  return (
    <div className="table-container">
      {/* HEADER */}
      <div className="table-header">
        {headerGroups.map((headerGroup) => (
          <div
            key={headerGroup.id}
            className="table-header-row"
            style={{
              gridTemplateColumns: headerGroup.headers
                .map((h) => `${h.getSize()}fr`)
                .join(' '),
            }}
          >
            {headerGroup.headers.map((header) => (
              <div key={header.id} className="table-header-cell">
                {header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext())}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* BODY (VIRTUALIZED) */}
      <div ref={parentRef} className="table-body">
        <div style={{ height: totalSize, position: 'relative', width: '100%' }}>
          {virtualItems.map((virtualRow) => {
            const row = table.getRowModel().rows[virtualRow.index]
            return (
              <div
                key={row.id}
                className="table-row"
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div
                  className="table-row-content"
                  style={{
                    gridTemplateColumns: row.getVisibleCells()
                      .map((c) => `${c.column.getSize()}fr`)
                      .join(' '),
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <div key={cell.id} className="table-cell">
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