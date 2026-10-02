import { Database, Image, Layers, RefreshCw, ServerOff, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

import { ErrorApi } from '../services/api';
import { mensajeDeError } from '../services/errores';

interface Props {
  titulo: string;
  descripcion?: string;
  error: unknown;
  alReintentar?: () => void;
}

/** Linea con el paso fallido, que es lo que pide el enunciado documentar. */
export function DetalleError({ error }: { error: unknown }) {
  if (!(error instanceof ErrorApi)) return null;
  return (
    <p className="mt-1 font-mono text-xs text-tinta-suave">
      paso: {error.paso} · codigo: {error.codigo}
    </p>
  );
}

export function AvisoError({ titulo, descripcion, error, alReintentar }: Props) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-4 rounded-tarjeta border border-alerta/40 bg-alerta/10 p-6 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex gap-3">
        <TriangleAlert className="mt-0.5 h-6 w-6 shrink-0 text-alerta" aria-hidden="true" />
        <div>
          <h2 className="font-bold text-tinta">{titulo}</h2>
          <p className="mt-1 text-sm text-tinta-suave">{descripcion ?? mensajeDeError(error)}</p>
          <DetalleError error={error} />
        </div>
      </div>
      {alReintentar && (
        <button
          type="button"
          onClick={alReintentar}
          className="inline-flex items-center gap-2 rounded-control bg-superficie px-4 py-2 text-sm font-bold text-tinta shadow-tarjeta transition duration-200 hover:bg-alerta/20"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Reintentar
        </button>
      )}
    </div>
  );
}

export function AvisoVacio({
  titulo,
  descripcion,
  icono,
  accion,
}: {
  titulo: string;
  descripcion: string;
  icono?: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-tarjeta border border-dashed border-borde bg-superficie px-6 py-16 text-center">
      <span className="rounded-control bg-pastel-lavanda/40 p-3 text-primario-700">
        {icono ?? <Layers className="h-7 w-7" aria-hidden="true" />}
      </span>
      <h2 className="text-lg font-bold text-tinta">{titulo}</h2>
      <p className="max-w-md text-sm text-tinta-suave">{descripcion}</p>
      {accion}
    </div>
  );
}

/** 502 / 503: un servicio de AWS o la base de datos cayo. */
export function AvisoServicioCaido({ error }: { error: unknown }) {
  const paso = error instanceof ErrorApi ? error.paso : 'desconocido';
  return (
    <div className="rounded-tarjeta border border-pastel-melocoton bg-pastel-melocoton/20 p-6">
      <div className="flex gap-3">
        <ServerOff className="mt-0.5 h-6 w-6 shrink-0 text-tinta" aria-hidden="true" />
        <div>
          <h2 className="font-bold text-tinta">Un servicio esta caido</h2>
          <p className="mt-1 text-sm text-tinta-suave">
            La API responde con error {paso}. Los datos siguen a salvo: no se registro nada a
            medias. Levanta el servicio en FLOCI o reinicia la API e intentalo de nuevo.
          </p>
          <DetalleError error={error} />
        </div>
      </div>
    </div>
  );
}

/** Esqueleto de carga reutilizable. */
export function Esqueleto({ className = '' }: { className?: string }) {
  return <div className={`esqueleto ${className}`} />;
}

/** Etiqueta del estado del producto (RDS) o del procesamiento (DynamoDB). */
export function EtiquetaEstado({
  estado,
  publicada,
}: {
  estado: string;
  publicada: boolean;
}) {
  const clases = publicada
    ? 'bg-pastel-verde text-primario-700'
    : 'bg-pastel-melocoton text-tinta';
  return (
    <span className={`etiqueta ${clases}`}>
      {publicada ? <Image className="h-3.5 w-3.5" aria-hidden="true" /> : <Database className="h-3.5 w-3.5" aria-hidden="true" />}
      {estado}
    </span>
  );
}
