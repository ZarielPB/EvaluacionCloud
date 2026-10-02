import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Variante = 'primario' | 'secundario' | 'contorno' | 'fantasma';

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-primario-200 text-tinta hover:bg-primario-300 shadow-tarjeta',
  secundario: 'bg-pastel-melocoton text-tinta hover:bg-pastel-rosa shadow-tarjeta',
  contorno: 'border border-primario-300 bg-superficie text-primario-700 hover:bg-primario-50',
  fantasma: 'text-tinta-suave hover:bg-primario-50 hover:text-tinta',
};

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-control px-5 py-2.5 text-sm font-bold ' +
  'transition duration-200 disabled:cursor-not-allowed disabled:opacity-60';

interface PropsComun {
  variante?: Variante;
  children: ReactNode;
  className?: string;
}

interface PropsBoton
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>,
    PropsComun {
  cargando?: boolean;
}

interface PropsEnlace extends PropsComun {
  to: string;
}

function PuntoCargando() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-tinta/25 border-t-tinta"
    />
  );
}

export function Boton({
  variante = 'primario',
  cargando = false,
  className = '',
  children,
  disabled,
  ...resto
}: PropsBoton) {
  return (
    <button
      className={`${BASE} ${VARIANTES[variante]} ${className}`}
      disabled={disabled || cargando}
      {...resto}
    >
      {cargando && <PuntoCargando />}
      {children}
    </button>
  );
}

export function BotonEnlace({
  variante = 'primario',
  to,
  className = '',
  children,
}: PropsEnlace) {
  return (
    <Link to={to} className={`${BASE} ${VARIANTES[variante]} ${className}`}>
      {children}
    </Link>
  );
}
