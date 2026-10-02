import { Boxes, PackagePlus, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AvisoError, AvisoServicioCaido, AvisoVacio, Esqueleto } from '../components/Avisos';
import { Boton, BotonEnlace } from '../components/Boton';
import { CabeceraPagina } from '../components/CabeceraPagina';
import { EsqueletoTarjeta, TarjetaProducto } from '../components/TarjetaProducto';
import { useToast } from '../components/toastContext';
import { ErrorApi, listarCategorias, listarProductos } from '../services/api';
import { colorDeCategoria } from '../utils/color';
import type { Categoria, ProductoResumen } from '../types';

const TODAS = 'TODAS';

export function Catalogo() {
  const [productos, setProductos] = useState<ProductoResumen[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [categoriaActiva, setCategoriaActiva] = useState<string>(TODAS);
  const [busqueda, setBusqueda] = useState('');

  const toast = useToast();

  // El reintento se dispara con un contador, no llamando a la carga desde
  // dentro de si misma: asi el efecto no se captura durante su inicializacion.
  const [intento, setIntento] = useState(0);
  const reintentar = useCallback(() => setIntento((actual) => actual + 1), []);

  useEffect(() => {
    let vigente = true;

    // Al reintentar hay que volver a mostrar los esqueletos, y eso es un
    // setState sincrono al entrar al efecto: es el unico caso en el que el
    // estado de carga se reinicia a proposito.
    // oxlint-disable-next-line react/set-state-in-effect
    setCargando(true);

    // El catalogo y las categorias van en paralelo: son dos endpoints
    // distintos y el catalogo ya trae el nombre de la categoria.
    Promise.all([listarProductos(), listarCategorias()])
      .then(([listaProductos, listaCategorias]) => {
        if (!vigente) return;
        setProductos(listaProductos);
        setCategorias(listaCategorias);
        setError(null);
      })
      .catch((fallo: unknown) => {
        if (!vigente) return;
        setError(fallo);
        toast.error(
          'No se pudo cargar el catalogo',
          fallo instanceof ErrorApi ? fallo.mensaje : 'Error inesperado',
          { etiqueta: 'Reintentar', alPulsar: reintentar },
        );
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });

    return () => {
      vigente = false;
    };
  }, [intento, reintentar, toast]);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return productos.filter((producto) => {
      const coincideCategoria =
        categoriaActiva === TODAS || producto.categoria.toUpperCase() === categoriaActiva;
      const coincideTexto =
        texto === '' ||
        producto.nombre.toLowerCase().includes(texto) ||
        producto.codigo.toLowerCase().includes(texto) ||
        producto.descripcion.toLowerCase().includes(texto);
      return coincideCategoria && coincideTexto;
    });
  }, [productos, categoriaActiva, busqueda]);

  const hayFiltros = categoriaActiva !== TODAS || busqueda.trim() !== '';

  return (
    <div className="space-y-6">
      <CabeceraPagina
        titulo="Catalogo de productos"
        descripcion="Solo aparecen los productos PUBLISHED: la API exige que la miniatura este confirmada en DynamoDB y almacenada en S3 antes de publicarlos."
        icono={<Boxes className="h-5 w-5" aria-hidden="true" />}
        acciones={
          <BotonEnlace to="/registrar" variante="secundario">
            <PackagePlus className="h-4 w-4" aria-hidden="true" />
            Registrar producto
          </BotonEnlace>
        }
      />

      <div className="space-y-4 rounded-tarjeta border border-borde bg-superficie p-4 shadow-tarjeta">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta-suave"
            aria-hidden="true"
          />
          <input
            type="search"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
            placeholder="Buscar por nombre, codigo o descripcion"
            aria-label="Buscar productos"
            className="w-full rounded-control border border-borde bg-lienzo py-2.5 pl-10 pr-4 text-sm text-tinta placeholder:text-tinta-suave focus:border-primario-300 focus:bg-superficie"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-tinta-suave">
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            Categoria
          </span>

          <button
            type="button"
            onClick={() => setCategoriaActiva(TODAS)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition duration-200 ${
              categoriaActiva === TODAS
                ? 'bg-primario-200 text-tinta shadow-tarjeta'
                : 'bg-lienzo text-tinta-suave hover:bg-primario-50 hover:text-tinta'
            }`}
          >
            Todas
          </button>

          {categorias.map((categoria) => (
            <button
              key={categoria.categoria_id}
              type="button"
              onClick={() => setCategoriaActiva(categoria.nombre.toUpperCase())}
              title={categoria.descripcion}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition duration-200 ${
                categoriaActiva === categoria.nombre.toUpperCase()
                  ? `${colorDeCategoria(categoria.nombre)} shadow-tarjeta ring-2 ring-primario-300`
                  : `${colorDeCategoria(categoria.nombre)} opacity-60 hover:opacity-100`
              }`}
            >
              {categoria.nombre}
            </button>
          ))}

          {hayFiltros && (
            <button
              type="button"
              onClick={() => {
                setCategoriaActiva(TODAS);
                setBusqueda('');
              }}
              className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold text-tinta-suave underline-offset-4 hover:text-tinta hover:underline"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {cargando && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, indice) => (
            <EsqueletoTarjeta key={indice} />
          ))}
        </div>
      )}

      {!cargando && error !== null && (
        <div className="space-y-4">
          {error instanceof ErrorApi && (error.estado === 502 || error.estado === 503) ? (
            <AvisoServicioCaido error={error} />
          ) : (
            <AvisoError
              titulo="No se pudo cargar el catalogo"
              descripcion={error instanceof ErrorApi ? error.mensaje : undefined}
              error={error}
              alReintentar={reintentar}
            />
          )}
          <Boton variante="contorno" onClick={reintentar}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reintentar
          </Boton>
        </div>
      )}

      {!cargando && !error && (
        <>
          <p className="text-sm text-tinta-suave" aria-live="polite">
            {visibles.length === 1 ? '1 producto' : `${visibles.length} productos`}
            {hayFiltros ? ' con los filtros aplicados' : ' publicados'}
          </p>

          {visibles.length === 0 ? (
            productos.length === 0 ? (
              <AvisoVacio
                titulo="No hay productos publicados aun"
                descripcion="Un producto solo aparece cuando su imagen fue procesada y la miniatura quedo verificada en S3. Registra el primero para empezar."
                icono={<Boxes className="h-7 w-7" aria-hidden="true" />}
                accion={
                  <BotonEnlace to="/registrar" variante="primario">
                    <PackagePlus className="h-4 w-4" aria-hidden="true" />
                    Registrar producto
                  </BotonEnlace>
                }
              />
            ) : (
              <AvisoVacio
                titulo="Ningun producto coincide"
                descripcion="Prueba con otro texto de busqueda o quita el filtro de categoria."
                icono={<Search className="h-7 w-7" aria-hidden="true" />}
                accion={
                  <Boton
                    variante="contorno"
                    onClick={() => {
                      setCategoriaActiva(TODAS);
                      setBusqueda('');
                    }}
                  >
                    Limpiar filtros
                  </Boton>
                }
              />
            )
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibles.map((producto) => (
                <TarjetaProducto key={producto.producto_id} producto={producto} />
              ))}
            </div>
          )}
        </>
      )}

      {cargando && (
        <p className="flex items-center justify-center gap-2 text-sm text-tinta-suave">
          <Esqueleto className="h-4 w-4 rounded-full" />
          Consultando RDS y DynamoDB...
        </p>
      )}
    </div>
  );
}
