import type { ReactNode } from 'react';

interface Props {
  titulo: string;
  descripcion?: string;
  icono?: ReactNode;
  acciones?: ReactNode;
  children?: ReactNode;
}

export function CabeceraPagina({ titulo, descripcion, icono, acciones, children }: Props) {
  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          {icono && (
            <span className="rounded-control bg-primario-100 p-2.5 text-primario-700">{icono}</span>
          )}
          <div>
            <h1 className="text-2xl font-extrabold text-tinta sm:text-3xl">{titulo}</h1>
            {descripcion && <p className="mt-1 max-w-2xl text-tinta-suave">{descripcion}</p>}
          </div>
        </div>
        {acciones && <div className="flex shrink-0 gap-2">{acciones}</div>}
      </div>
      {children}
    </div>
  );
}
