import { PackagePlus, Search, Boxes } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const ENLACES = [
  { to: '/', etiqueta: 'Inicio' },
  { to: '/catalogo', etiqueta: 'Catalogo' },
  { to: '/registrar', etiqueta: 'Registrar producto' },
];

function claseEnlace({ isActive }: { isActive: boolean }): string {
  return [
    'rounded-control px-3 py-2 text-sm font-bold transition duration-200',
    isActive
      ? 'bg-primario-100 text-primario-700'
      : 'text-tinta-suave hover:bg-primario-50 hover:text-tinta',
  ].join(' ');
}

export function Navbar() {
  return (
    <header className="sticky top-0 z-20 border-b border-borde bg-superficie/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <NavLink to="/" className="flex items-center gap-2">
          <span className="rounded-control bg-primario-200 p-2 text-tinta">
            <Boxes className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-lg font-extrabold tracking-tight text-tinta">LOMAX SA</span>
        </NavLink>

        <nav aria-label="Navegacion principal" className="ml-auto flex items-center gap-1">
          {ENLACES.map((enlace) => (
            <NavLink key={enlace.to} to={enlace.to} end={enlace.to === '/'} className={claseEnlace}>
              {enlace.etiqueta}
            </NavLink>
          ))}
        </nav>

        <NavLink
          to="/registrar"
          className="hidden items-center gap-2 rounded-control bg-pastel-melocoton px-4 py-2 text-sm font-bold text-tinta shadow-tarjeta transition duration-200 hover:bg-pastel-rosa sm:inline-flex"
        >
          <PackagePlus className="h-4 w-4" aria-hidden="true" />
          Nuevo producto
        </NavLink>
      </div>

      <div className="border-t border-borde/70 bg-primario-50/60 px-4 py-1.5 text-center text-xs text-tinta-suave sm:hidden">
        <Search className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
        Catalogo y registro de productos
      </div>
    </header>
  );
}
