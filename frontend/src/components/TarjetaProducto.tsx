import { Link } from 'react-router-dom';

import { ImagenProducto } from './ImagenProducto';
import { colorDeCategoria } from '../utils/color';
import { formatearPrecio } from '../utils/formato';
import type { ProductoResumen } from '../types';

export function TarjetaProducto({ producto }: { producto: ProductoResumen }) {
  return (
    <Link
      to={`/productos/${producto.producto_id}`}
      className="group flex flex-col overflow-hidden rounded-tarjeta border border-borde bg-superficie shadow-tarjeta transition duration-200 hover:-translate-y-0.5 hover:border-primario-300 hover:shadow-tarjeta-hover"
    >
      <div className="relative aspect-[3/2] w-full overflow-hidden bg-primario-50">
        <ImagenProducto
          key={producto.producto_id}
          productoId={producto.producto_id}
          disponible={producto.imagen_disponible}
          alt={`Miniatura de ${producto.nombre}`}
          className="h-full w-full object-cover"
        />
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <span
          className={`etiqueta w-fit ${colorDeCategoria(producto.categoria)}`}
          title={`Categoria: ${producto.categoria}`}
        >
          {producto.categoria}
        </span>

        <h3 className="line-clamp-2 font-bold leading-snug text-tinta transition duration-200 group-hover:text-primario-600">
          {producto.nombre}
        </h3>

        <p className="line-clamp-2 text-xs text-tinta-suave">{producto.descripcion}</p>

        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <span className="text-lg font-extrabold text-tinta">
            {formatearPrecio(producto.precio)}
          </span>
          <span className="font-mono text-xs text-tinta-suave">
            {producto.codigo}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function EsqueletoTarjeta() {
  return (
    <div className="overflow-hidden rounded-tarjeta border border-borde bg-superficie">
      <div className="esqueleto aspect-[3/2] w-full rounded-none" />
      <div className="space-y-3 p-4">
        <div className="esqueleto h-4 w-20" />
        <div className="esqueleto h-4 w-full" />
        <div className="esqueleto h-3 w-2/3" />
        <div className="esqueleto h-5 w-24" />
      </div>
    </div>
  );
}
