import { createContext, useContext } from 'react';

export type TonoToast = 'exito' | 'error' | 'info';

export interface Toast {
  id: number;
  tono: TonoToast;
  titulo: string;
  detalle?: string;
  accion?: { etiqueta: string; alPulsar: () => void };
}

export type ToastNuevo = Omit<Toast, 'id'>;

export interface ContextoToast {
  mostrar: (toast: ToastNuevo) => void;
  exito: (titulo: string, detalle?: string) => void;
  error: (titulo: string, detalle?: string, accion?: Toast['accion']) => void;
}

export const ContextoToast = createContext<ContextoToast | null>(null);

export function useToast(): ContextoToast {
  const contexto = useContext(ContextoToast);
  if (!contexto) throw new Error('useToast debe usarse dentro de <ProveedorToast>');
  return contexto;
}
