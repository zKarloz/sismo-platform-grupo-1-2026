/** Indicador de carga reutilizable para todos los módulos.
 * Usa los colores actuales del tema y evita bloquear los controles del mapa.
 * En modo de movimiento reducido, el icono permanece estático.
 */
import { LoaderCircle } from 'lucide-react';

type Props = {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'inline' | 'centered' | 'overlay';
  className?: string;
};

const sizes = { sm: 'size-4', md: 'size-5', lg: 'size-7' } as const;

export default function LoadingSpinner({
  label = 'Cargando datos…',
  size = 'md',
  variant = 'centered',
  className = '',
}: Props) {
  // Una sola etiqueta de estado accesible, también si el texto está oculto.
  const content = <>
    <LoaderCircle className={`${sizes[size]} shrink-0 animate-spin motion-reduce:animate-none`} aria-hidden="true" />
    {label ? <span>{label}</span> : <span className="sr-only">Cargando datos…</span>}
  </>;

  if (variant === 'overlay') {
    return <div role="status" aria-live="polite"
      className={`pointer-events-none absolute inset-0 z-[400] flex items-center justify-center ${className}`}>
      <div className="inline-flex items-center gap-2 rounded-lg border border-border-ui bg-panel/95 px-4 py-3 text-sm font-medium text-main shadow-md">
        {content}
      </div>
    </div>;
  }

  return <div role="status" aria-live="polite"
    className={`${variant === 'inline' ? 'inline-flex' : 'flex justify-center py-8 text-muted'} items-center gap-2 text-sm ${className}`}>
    {content}
  </div>;
}
