/** Paginación controlada y reutilizable para tablas con datos del servidor.
 * El consumidor decide el tamaño inicial (5 o 10) y consulta la API al cambiar.
 * No calcula páginas a partir de una lista parcial en memoria.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';

export type TablePageSize = 5 | 10 | 20;

type Props = {
  page: number;
  pages: number;
  pageSize: TablePageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: TablePageSize) => void;
  disabled?: boolean;
  className?: string;
};

export default function TablePagination({ page, pages, pageSize,
  onPageChange, onPageSizeChange, disabled = false, className = '',
}: Props) {
  const lastPage = Math.max(1, pages);
  const currentPage = Math.min(Math.max(1, page), lastPage);
  const control = 'rounded-lg border border-border-ui bg-page px-3 py-2 text-sm text-main';

  return <footer aria-label="Paginación de tabla"
    className={`flex flex-wrap items-center justify-between gap-3 border-t border-border-ui px-4 py-3 text-sm text-muted ${className}`}>
    <label className="flex items-center gap-2 whitespace-nowrap">Mostrar
      <select aria-label="Registros por página" className={control} value={pageSize}
        disabled={disabled}
        onChange={event => onPageSizeChange(Number(event.target.value) as TablePageSize)}>
        <option value={5}>5</option>
        <option value={10}>10</option>
        <option value={20}>20</option>
      </select>
      registros
    </label>
    <div className="flex items-center gap-3">
      <span className="whitespace-nowrap text-xs tabular-nums" aria-live="polite">
        Página {currentPage} de {lastPage}
      </span>
      <button type="button" aria-label="Página anterior" title="Página anterior"
        disabled={disabled || currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
        className="rounded-lg border border-border-ui p-2 text-main transition-colors hover:bg-panel-alt disabled:cursor-not-allowed disabled:opacity-30">
        <ChevronLeft size={17}/>
      </button>
      <button type="button" aria-label="Página siguiente" title="Página siguiente"
        disabled={disabled || currentPage >= lastPage}
        onClick={() => onPageChange(currentPage + 1)}
        className="rounded-lg border border-border-ui p-2 text-main transition-colors hover:bg-panel-alt disabled:cursor-not-allowed disabled:opacity-30">
        <ChevronRight size={17}/>
      </button>
    </div>
  </footer>;
}
