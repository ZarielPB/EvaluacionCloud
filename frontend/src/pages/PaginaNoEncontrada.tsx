import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';

export function PaginaNoEncontrada() {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <span className="rounded-control bg-pastel-lavanda/50 p-4 text-primario-700">
        <Compass className="h-8 w-8" aria-hidden="true" />
      </span>
      <h1 className="text-3xl font-extrabold text-tinta">Pagina no encontrada</h1>
      <p className="max-w-md text-tinta-suave">
        La ruta que buscas no existe en la aplicacion. Vuelve al inicio o revisa el catalogo.
      </p>
      <Link
        to="/"
        className="rounded-control bg-primario-200 px-5 py-2.5 text-sm font-bold text-tinta shadow-tarjeta transition duration-200 hover:bg-primario-300"
      >
        Ir al inicio
      </Link>
    </div>
  );
}
