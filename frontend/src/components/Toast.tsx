import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';

import { ContextoToast, type Toast, type TonoToast } from './toastContext';

const ESTILOS: Record<TonoToast, string> = {
  exito: 'border-pastel-verde bg-pastel-verde/25',
  error: 'border-alerta/50 bg-alerta/15',
  info: 'border-primario-300 bg-primario-50',
};

const ICONOS: Record<TonoToast, typeof CheckCircle2> = {
  exito: CheckCircle2,
  error: TriangleAlert,
  info: Info,
};

export function ProveedorToast({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const siguiente = useRef(1);

  const cerrar = useCallback((id: number) => {
    setToasts((actuales) => actuales.filter((toast) => toast.id !== id));
  }, []);

  const mostrar = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = siguiente.current++;
      setToasts((actuales) => [...actuales.slice(-2), { ...toast, id }]);
      // Los toasts con accion (Reintentar, Ver detalle) se quedan mas tiempo.
      window.setTimeout(() => cerrar(id), toast.accion ? 12_000 : 6_000);
    },
    [cerrar],
  );

  const valor = useMemo(
    () => ({
      mostrar,
      exito: (titulo: string, detalle?: string) => mostrar({ tono: 'exito' as const, titulo, detalle }),
      error: (titulo: string, detalle?: string, accion?: Toast['accion']) =>
        mostrar({ tono: 'error' as const, titulo, detalle, accion }),
    }),
    [mostrar],
  );

  return (
    <ContextoToast.Provider value={valor}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
      >
        {toasts.map((toast) => {
          const Icono = ICONOS[toast.tono];
          return (
            <div
              key={toast.id}
              role="status"
              className={`pointer-events-auto animate-toast-in rounded-tarjeta border p-4 shadow-tarjeta-hover ${ESTILOS[toast.tono]}`}
            >
              <div className="flex gap-3">
                <Icono className="mt-0.5 h-5 w-5 shrink-0 text-tinta" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-tinta">{toast.titulo}</p>
                  {toast.detalle && (
                    <p className="mt-1 break-words text-xs text-tinta-suave">{toast.detalle}</p>
                  )}
                  {toast.accion && (
                    <button
                      type="button"
                      onClick={toast.accion.alPulsar}
                      className="mt-2 rounded-control bg-superficie px-3 py-1.5 text-xs font-bold text-tinta shadow-tarjeta transition duration-200 hover:bg-primario-50"
                    >
                      {toast.accion.etiqueta}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => cerrar(toast.id)}
                  aria-label="Cerrar aviso"
                  className="shrink-0 text-tinta-suave transition duration-200 hover:text-tinta"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ContextoToast.Provider>
  );
}
