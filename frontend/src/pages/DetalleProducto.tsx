import {
  ArrowLeft,
  Boxes,
  CalendarDays,
  CheckCircle2,
  CloudUpload,
  Database,
  Hash,
  ImageOff,
  Loader2,
  Package,
  RefreshCw,
  Tag,
  TriangleAlert,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';

import { AvisoError, AvisoServicioCaido, AvisoVacio, Esqueleto, EtiquetaEstado } from '../components/Avisos';
import { Boton, BotonEnlace } from '../components/Boton';
import { CabeceraPagina } from '../components/CabeceraPagina';
import { ImagenProducto } from '../components/ImagenProducto';
import { useToast } from '../components/toastContext';
import { ErrorApi, MAX_BYTES_IMAGEN, obtenerProducto, reprocesarImagen, subirImagen, urlImagen } from '../services/api';
import { colorDeCategoria } from '../utils/color';
import {
  etiquetaDeAtributo,
  formatearBytes,
  formatearFecha,
  formatearPrecio,
  valorDeAtributo,
} from '../utils/formato';
import type { ProductoDetalle } from '../types';

/** Traduce `estado_procesamiento` de DynamoDB a algo legible. */
const ESTADO_PROCESAMIENTO: Record<string, { texto: string; ayuda: string }> = {
  PENDIENTE: {
    texto: 'Imagen pendiente',
    ayuda: 'El producto esta registrado pero aun no tiene miniatura, asi que no aparece en el catalogo.',
  },
  LISTA: {
    texto: 'Miniatura lista',
    ayuda: 'La Lambda genero la miniatura y DynamoDB la confirmo.',
  },
  ERROR: {
    texto: 'Error de procesamiento',
    ayuda: 'La Lambda no pudo generar la miniatura. Se puede reintentar con el original guardado.',
  },
};

function Dato({
  icono,
  etiqueta,
  children,
}: {
  icono: ReactNode;
  etiqueta: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0 text-tinta-suave" aria-hidden="true">
        {icono}
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-bold uppercase tracking-wide text-tinta-suave">{etiqueta}</dt>
        <dd className="mt-0.5 break-words text-tinta">{children}</dd>
      </div>
    </div>
  );
}

export function DetalleProducto() {
  const { productoId } = useParams();
  const id = Number(productoId);

  const [producto, setProducto] = useState<ProductoDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<ErrorApi | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [procesando, setProcesando] = useState(false);
  // El reintento del boton de error incrementa este contador para volver a
  // disparar el efecto, igual que hace el catalogo.
  const [intento, setIntento] = useState(0);
  const toast = useToast();

  const idInvalido = !Number.isInteger(id) || id <= 0;

  // Un id que no es un entero no se pide a la API: se resuelve en render para
  // no meter un setState sincrono dentro del efecto.
  const errorIdInvalido = idInvalido
    ? new ErrorApi(400, {
        mensaje: `El identificador "${productoId}" no es un producto valido.`,
        paso: 'validacion_entrada',
        codigo: 'id_invalido',
      })
    : null;
  const fallo = error ?? errorIdInvalido;

  const reintentar = useCallback(() => {
    setError(null);
    setIntento((actual) => actual + 1);
  }, []);

  useEffect(() => {
    let vigente = true;

    if (idInvalido) {
      return () => {
        vigente = false;
      };
    }

    // Al reintentar hay que volver a mostrar los esqueletos, y eso es un
    // setState sincrono al entrar al efecto.
    // oxlint-disable-next-line react/set-state-in-effect
    setCargando(true);

    obtenerProducto(id)
      .then((datos) => {
        if (!vigente) return;
        setProducto(datos);
        setError(null);
      })
      .catch((fallo: unknown) => {
        if (!vigente) return;
        setError(
          fallo instanceof ErrorApi ? fallo : new ErrorApi(502, { mensaje: String(fallo) }),
        );
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });

    return () => {
      vigente = false;
    };
  }, [id, idInvalido, intento]);

  /** Vuelve a pedir el producto sin volver a mostrar los esqueletos. */
  const refrescar = useCallback(async () => {
    if (idInvalido) return;
    try {
      const datos = await obtenerProducto(id);
      setProducto(datos);
      setError(null);
    } catch (fallo) {
      setError(fallo instanceof ErrorApi ? fallo : new ErrorApi(502, { mensaje: String(fallo) }));
    }
  }, [id, idInvalido]);

  const atributos = useMemo(
    () => Object.entries(producto?.atributos ?? {}),
    [producto?.atributos],
  );

  /** Sube la imagen de un producto PENDIENTE y recarga el detalle. */
  const manejarArchivo = useCallback(
    async (evento: ChangeEvent<HTMLInputElement>) => {
      const archivo = evento.target.files?.[0];
      evento.target.value = '';
      if (!archivo || !producto) return;

      if (archivo.size > MAX_BYTES_IMAGEN) {
        toast.error('La imagen es muy grande', `Supera el maximo de ${formatearBytes(MAX_BYTES_IMAGEN)}.`);
        return;
      }

      setSubiendo(true);
      try {
        const respuesta = await subirImagen(producto.producto_id, archivo);
        toast.exito('Producto publicado exitosamente', `producto_id ${respuesta.producto_id}`);
        await refrescar();
      } catch (fallo) {
        const apiError = fallo instanceof ErrorApi ? fallo : new ErrorApi(502, { mensaje: String(fallo) });
        toast.error('No se pudo publicar', apiError.mensaje);
        await refrescar();
      } finally {
        setSubiendo(false);
      }
    },
    [producto, refrescar, toast],
  );

  /** Reinvoca la Lambda sobre el original que ya esta en S3. */
  const reprocesar = useCallback(async () => {
    if (!producto) return;
    setProcesando(true);
    try {
      const respuesta = await reprocesarImagen(producto.producto_id);
      toast.exito(
        respuesta.reprocesado ? 'Imagen reprocesada' : 'Producto publicado exitosamente',
        `producto_id ${respuesta.producto_id}`,
      );
      await refrescar();
    } catch (fallo) {
      const apiError = fallo instanceof ErrorApi ? fallo : new ErrorApi(502, { mensaje: String(fallo) });
      toast.error('El reprocesamiento fallo', apiError.mensaje);
      await refrescar();
    } finally {
      setProcesando(false);
    }
  }, [producto, refrescar, toast]);

  const ocupado = subiendo || procesando;
  const publicada = producto?.estado === 'PUBLICADO';
  const tieneOriginal = Boolean(producto?.imagen_original_key);
  const procesamiento = producto?.estado_procesamiento
    ? ESTADO_PROCESAMIENTO[producto.estado_procesamiento]
    : null;

  // ---------- Estados de carga y error ----------
  if (cargando && !idInvalido) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <CabeceraPagina titulo="Cargando producto" icono={<Package className="h-5 w-5" aria-hidden="true" />} />
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <Esqueleto className="h-72 rounded-tarjeta" />
          <div className="space-y-3">
            <Esqueleto className="h-8 w-3/4 rounded-control" />
            <Esqueleto className="h-4 w-full rounded-control" />
            <Esqueleto className="h-4 w-5/6 rounded-control" />
            <Esqueleto className="h-24 w-full rounded-tarjeta" />
          </div>
        </div>
      </div>
    );
  }

  if (fallo && !producto) {
    const caido = fallo.estado === 502 || fallo.estado === 503 || fallo.estado === 504;
    const noExiste = fallo.estado === 404;

    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <BotonEnlace to="/catalogo" variante="fantasma">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Volver al catalogo
        </BotonEnlace>
        {caido ? (
          <AvisoServicioCaido error={fallo} />
        ) : noExiste ? (
          <AvisoVacio
            icono={<Package className="h-7 w-7" aria-hidden="true" />}
            titulo="Producto no encontrado"
            descripcion={fallo.mensaje}
            accion={
              <BotonEnlace to="/catalogo" variante="primario">
                Ver el catalogo
              </BotonEnlace>
            }
          />
        ) : (
          <AvisoError
            titulo="No se pudo cargar el producto"
            error={fallo}
            alReintentar={reintentar}
          />
        )}
      </div>
    );
  }

  if (!producto) return null;

  // ---------- Detalle ----------
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <BotonEnlace to="/catalogo" variante="fantasma">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Volver al catalogo
      </BotonEnlace>

      <CabeceraPagina
        titulo={producto.nombre}
        descripcion={producto.descripcion}
        icono={<Package className="h-5 w-5" aria-hidden="true" />}
        acciones={
          <>
            <EtiquetaEstado estado={producto.estado} publicada={publicada} />
            <span className={`etiqueta ${colorDeCategoria(producto.categoria)}`}>
              <Tag className="h-3.5 w-3.5" aria-hidden="true" />
              {producto.categoria}
            </span>
          </>
        }
      />

      {fallo && producto && (
        <AvisoError titulo="No se pudo actualizar la vista" error={fallo} alReintentar={reintentar} />
      )}

      {producto.estado === 'PENDIENTE' && (
        <div className="rounded-tarjeta border border-pastel-melocoton bg-pastel-melocoton/20 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <IconoPendiente />
              <div>
                <h2 className="font-bold text-tinta">Este producto aun no aparece en el catalogo</h2>
                <p className="mt-1 text-sm text-tinta-suave">
                  {tieneOriginal
                    ? 'Ya tiene un original guardado en S3: puedes reprocesarlo para generar la miniatura.'
                    : 'No tiene imagen. Cargala y la Lambda generara la miniatura para publicarlo.'}
                </p>
                {producto.error_motivo && (
                  <p className="mt-2 flex items-start gap-1.5 font-mono text-xs text-alerta">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {producto.error_motivo}
                  </p>
                )}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              {tieneOriginal && (
                <Boton variante="secundario" onClick={() => void reprocesar()} cargando={procesando}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Reprocesar imagen
                </Boton>
              )}
              <label
                className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-control bg-primario-200 px-5 py-2.5 text-sm font-bold text-tinta shadow-tarjeta transition duration-200 ${
                  ocupado ? 'pointer-events-none opacity-60' : 'hover:bg-primario-300'
                }`}
              >
                {subiendo ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <CloudUpload className="h-4 w-4" aria-hidden="true" />
                )}
                {tieneOriginal ? 'Reemplazar imagen' : 'Cargar imagen'}
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  className="sr-only"
                  disabled={ocupado}
                  onChange={(e) => void manejarArchivo(e)}
                />
              </label>
            </div>
          </div>
          <p className="mt-3 text-xs text-tinta-suave">
            Solo JPEG o PNG, hasta {formatearBytes(MAX_BYTES_IMAGEN)}.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        {/* Miniatura */}
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-tarjeta border border-borde bg-primario-50">
            {publicada ? (
              <ImagenProducto
                productoId={producto.producto_id}
                disponible
                alt={`Miniatura de ${producto.nombre}`}
                className="h-72 w-full object-cover"
              />
            ) : (
              <div
                role="img"
                aria-label={`${producto.nombre}: sin miniatura disponible`}
                className="flex h-72 w-full flex-col items-center justify-center gap-2 bg-primario-50 text-tinta-suave"
              >
                <ImageOff className="h-8 w-8" aria-hidden="true" />
                <span className="text-sm">Sin miniatura</span>
                <span className="max-w-[16rem] px-4 text-center text-xs">
                  La miniatura la genera la Lambda cuando se sube una imagen.
                </span>
              </div>
            )}
          </div>

          {publicada && (
            <a
              href={urlImagen(producto.producto_id)}
              target="_blank"
              rel="noreferrer"
              className="block text-center text-xs font-semibold text-primario-700 underline-offset-2 hover:underline"
            >
              Abrir la miniatura en una pestana
            </a>
          )}
        </div>

        {/* Datos */}
        <div className="space-y-6">
          <div className="rounded-tarjeta border border-borde bg-superficie p-6 shadow-tarjeta">
            <p className="text-3xl font-extrabold text-tinta">{formatearPrecio(producto.precio)}</p>
            <dl className="mt-5 space-y-4">
              <Dato icono={<Hash className="h-4 w-4" />} etiqueta="Codigo">
                <span className="font-mono font-bold">{producto.codigo}</span>
              </Dato>
              <Dato icono={<Boxes className="h-4 w-4" />} etiqueta="Categoria">
                {producto.categoria}
              </Dato>
              <Dato icono={<CalendarDays className="h-4 w-4" />} etiqueta="Registrado el">
                {formatearFecha(producto.fecha_creacion)}
              </Dato>
              <Dato icono={<Database className="h-4 w-4" />} etiqueta="Identificador">
                <span className="font-mono">producto_id {producto.producto_id}</span>
              </Dato>
            </dl>
          </div>

          {procesamiento && (
            <div className="rounded-tarjeta border border-borde bg-superficie p-6 shadow-tarjeta">
              <h2 className="flex items-center gap-2 font-bold text-tinta">
                {producto.estado_procesamiento === 'LISTA' ? (
                  <CheckCircle2 className="h-4 w-4 text-primario-700" aria-hidden="true" />
                ) : producto.estado_procesamiento === 'ERROR' ? (
                  <TriangleAlert className="h-4 w-4 text-alerta" aria-hidden="true" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-tinta-suave" aria-hidden="true" />
                )}
                Procesamiento de la imagen
              </h2>
              <p className="mt-1 text-sm font-semibold text-tinta">{procesamiento.texto}</p>
              <p className="mt-1 text-sm text-tinta-suave">{procesamiento.ayuda}</p>
              {producto.miniatura_key && (
                <p className="mt-3 break-all font-mono text-xs text-tinta-suave">
                  S3: {producto.miniatura_key}
                </p>
              )}
              {producto.imagen_original_key && (
                <p className="mt-1 break-all font-mono text-xs text-tinta-suave">
                  Original: {producto.imagen_original_key}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Atributos variables de DynamoDB */}
      <div className="rounded-tarjeta border border-borde bg-superficie p-6 shadow-tarjeta">
        <h2 className="font-bold text-tinta">Atributos</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Vienen de DynamoDB, donde se guardan como mapa con clave de particion producto_id. No hay
          una columna fija para ellos.
        </p>

        {atributos.length === 0 ? (
          <p className="mt-4 rounded-control bg-lienzo px-4 py-3 text-sm text-tinta-suave">
            Este producto no tiene atributos variables registrados.
          </p>
        ) : (
          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {atributos.map(([clave, valor]) => (
              <div key={clave} className="rounded-control border border-borde bg-lienzo px-4 py-3">
                <dt className="text-xs font-bold uppercase tracking-wide text-tinta-suave">
                  {etiquetaDeAtributo(clave)}
                </dt>
                <dd className="mt-0.5 break-words font-semibold text-tinta">
                  {valorDeAtributo(valor)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <BotonEnlace to="/catalogo" variante="contorno">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Volver al catalogo
        </BotonEnlace>
        <BotonEnlace to="/registrar" variante="fantasma">
          <Package className="h-4 w-4" aria-hidden="true" />
          Registrar otro producto
        </BotonEnlace>
      </div>
    </div>
  );
}

function IconoPendiente() {
  return (
    <span className="mt-0.5 shrink-0 rounded-control bg-pastel-melocoton p-2 text-tinta">
      <Loader2 className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}