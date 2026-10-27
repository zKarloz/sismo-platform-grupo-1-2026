/** Modal común: fondo difuminado, foco contenido, Escape y bloqueo de scroll.
 * Los módulos reutilizan esta superficie en lugar de crear overlays distintos.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './modalMobile.css';

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  description?: string;
  /** Solo cuando se solicita: presentación compacta tipo panel inferior en teléfonos. */
  mobileSheet?: boolean;
};

export default function Modal({ open, title, onClose, children, footer, description, mobileSheet = false }: Props) {
  const id = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const controls = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      )).filter(element => element.getClientRects().length > 0);
      if (!controls.length) { event.preventDefault(); return; }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className={`fixed inset-0 z-[100] flex justify-center ${mobileSheet ? 'sismo-modal-mobile-overlay ' : ''}${mobileSheet
      ? 'items-end p-0 sm:items-center sm:p-6'
      : 'items-center p-4 sm:p-6'}`} role="presentation">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" aria-hidden="true" onMouseDown={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-description` : undefined}
        className={`relative flex min-w-0 w-full max-w-2xl flex-col overflow-hidden border border-border-ui bg-panel text-main shadow-2xl ${mobileSheet ? 'sismo-modal-mobile-panel ' : ''}${mobileSheet
          ? 'max-h-[calc(100dvh-0.5rem)] rounded-t-2xl sm:max-h-[min(90dvh,900px)] sm:rounded-2xl'
          : 'max-h-[min(90vh,900px)] rounded-2xl'}`}>
        <header className={`flex items-start justify-between gap-4 border-b border-border-ui ${mobileSheet
          ? 'shrink-0 px-4 py-3 sm:px-5 sm:py-4'
          : 'px-5 py-4'}`}>
          <div className="min-w-0 flex-1">
            <h2 id={`${id}-title`} className="text-lg font-semibold">{title}</h2>
            {description && <p id={`${id}-description`} className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar ventana"
            className="shrink-0 rounded-lg border border-border-ui p-2 text-muted hover:bg-panel-alt hover:text-main focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <X size={18} />
          </button>
        </header>
        {/* Limitar el ancho intrínseco de fechas/selectores; desplazamiento solo vertical. */}
        {/* En el modo móvil, los controles no deben ensanchar el panel. */}
        <div className={mobileSheet
          ? 'sismo-modal-mobile-body min-h-0 min-w-0 w-full overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5'
          : 'min-h-0 overflow-y-auto px-5 py-5'}>{children}</div>
        {footer && (mobileSheet
          ? <footer className="sismo-modal-mobile-footer shrink-0 border-t border-border-ui px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-4">
              <div className="flex flex-wrap justify-end gap-2">{footer}</div>
            </footer>
          : <footer className="flex flex-wrap justify-end gap-2 border-t border-border-ui px-5 py-4">{footer}</footer>)}
      </div>
    </div>,
    document.body,
  );
}
