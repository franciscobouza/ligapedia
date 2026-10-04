import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/states';
import { cn } from '@/lib/utils';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    align?: 'left' | 'right' | 'center';
    /** Short header with a full-name tooltip (e.g. PJ → Partidos jugados). */
    title?: string;
  }
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  initialSort?: SortingState;
  /** Keep the first column visible while scrolling horizontally (default true). */
  stickyFirst?: boolean;
  caption?: string;
  rowClassName?: (row: T) => string | undefined;
  empty?: string;
}

/** Sortable table on TanStack Table with shadcn styling; wide tables scroll inside their container. */
export function DataTable<T>({ data, columns, initialSort = [], stickyFirst = true, caption, rowClassName, empty }: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSort);
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  if (!data.length) return <EmptyState message={empty} />;
  const sticky = (i: number) => (stickyFirst && i === 0 ? 'bg-background sticky left-0 z-10 shadow-[1px_0_0_var(--border)]' : '');
  return (
    <div className="relative w-full overflow-x-auto rounded-lg border" data-slot="table-scroll">
      <Table>
        {caption && <caption className="sr-only">{caption}</caption>}
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((h, i) => {
                const meta = h.column.columnDef.meta;
                const sorted = h.column.getIsSorted();
                const align = meta?.align ?? 'left';
                return (
                  <TableHead
                    key={h.id}
                    className={cn(sticky(i), align === 'right' && 'text-right', align === 'center' && 'text-center')}
                    aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                    title={meta?.title}
                  >
                    {h.isPlaceholder ? null : h.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={h.column.getToggleSortingHandler()}
                        className={cn('inline-flex items-center gap-1 rounded px-0.5 hover:underline focus-visible:outline-2', align === 'right' && 'flex-row-reverse')}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {sorted === 'asc' ? <ArrowUp className="size-3" /> : sorted === 'desc' ? <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id} className={rowClassName?.(row.original)}>
              {row.getVisibleCells().map((cell, i) => {
                const align = cell.column.columnDef.meta?.align ?? 'left';
                return (
                  <TableCell
                    key={cell.id}
                    className={cn(sticky(i), 'tabular-nums', align === 'right' && 'text-right', align === 'center' && 'text-center')}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
