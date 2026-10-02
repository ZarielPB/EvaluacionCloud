import { CircleCheck, CircleX } from 'lucide-react';
import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

interface BaseCampo {
  etiqueta: string;
  error?: string;
  ayuda?: string;
  valido?: boolean;
  requerido?: boolean;
  contenedorClassName?: string;
}

const BASE =
  'w-full rounded-control border bg-superficie px-3 py-2.5 text-sm text-tinta ' +
  'placeholder:text-tinta-suave transition duration-200 focus:outline-none focus:ring-2';

function clases(estado: 'error' | 'ok' | 'neutro'): string {
  if (estado === 'error') return `${BASE} border-alerta focus:border-alerta focus:ring-alerta/30`;
  if (estado === 'ok') return `${BASE} border-pastel-verde focus:border-primario-300 focus:ring-primario-300/40`;
  return `${BASE} border-borde focus:border-primario-300 focus:ring-primario-300/40`;
}

function Pie({ error, ayuda, valido }: { error?: string; ayuda?: string; valido?: boolean }) {
  if (error) {
    return (
      <p className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-alerta">
        <CircleX className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {error}
      </p>
    );
  }
  if (valido) {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-primario-600">
        <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
        Correcto
      </p>
    );
  }
  if (ayuda) return <p className="mt-1.5 text-xs text-tinta-suave">{ayuda}</p>;
  return null;
}

export function CampoTexto({
  etiqueta,
  error,
  ayuda,
  valido,
  requerido,
  contenedorClassName = '',
  ...resto
}: BaseCampo & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const estado = error ? 'error' : valido ? 'ok' : 'neutro';
  return (
    <div className={contenedorClassName}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold text-tinta">
        {etiqueta}
        {requerido && <span className="ml-1 text-alerta">*</span>}
      </label>
      <input
        id={id}
        className={clases(estado)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...resto}
      />
      <div id={error ? `${id}-error` : undefined}>
        <Pie error={error} ayuda={ayuda} valido={valido} />
      </div>
    </div>
  );
}

export function CampoArea({
  etiqueta,
  error,
  ayuda,
  valido,
  requerido,
  contenedorClassName = '',
  ...resto
}: BaseCampo & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  const estado = error ? 'error' : valido ? 'ok' : 'neutro';
  return (
    <div className={contenedorClassName}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold text-tinta">
        {etiqueta}
        {requerido && <span className="ml-1 text-alerta">*</span>}
      </label>
      <textarea
        id={id}
        className={`${clases(estado)} min-h-24 resize-y`}
        aria-invalid={Boolean(error)}
        {...resto}
      />
      <Pie error={error} ayuda={ayuda} valido={valido} />
    </div>
  );
}

export function CampoSelect({
  etiqueta,
  error,
  ayuda,
  valido,
  requerido,
  opciones,
  marcador,
  contenedorClassName = '',
  ...resto
}: BaseCampo &
  SelectHTMLAttributes<HTMLSelectElement> & {
    opciones: { valor: string; texto: string }[];
    marcador?: ReactNode;
  }) {
  const id = useId();
  const estado = error ? 'error' : valido ? 'ok' : 'neutro';
  return (
    <div className={contenedorClassName}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold text-tinta">
        {etiqueta}
        {requerido && <span className="ml-1 text-alerta">*</span>}
      </label>
      <select
        id={id}
        className={clases(estado)}
        aria-invalid={Boolean(error)}
        {...resto}
      >
        {marcador}
        {opciones.map((opcion) => (
          <option key={opcion.valor} value={opcion.valor}>
            {opcion.texto}
          </option>
        ))}
      </select>
      <Pie error={error} ayuda={ayuda} valido={valido} />
    </div>
  );
}

export function ContenedorSeccion({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-tarjeta border border-borde bg-superficie p-5 shadow-tarjeta">
      <h2 className="text-base font-extrabold text-tinta">{titulo}</h2>
      {descripcion && <p className="mt-1 text-sm text-tinta-suave">{descripcion}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}