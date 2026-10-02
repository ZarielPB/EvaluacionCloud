import {
  ArrowLeft,
  CheckCircle2,
  Database,
  ImageOff,
  Loader2,
  PackageCheck,
  RefreshCw,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CabeceraPagina } from '../components/CabeceraPagina';
import { CampoArea, CampoSelect, CampoTexto, ContenedorSeccion } from '../components/Campo';
import { Boton, BotonEnlace } from '../components/Boton';
import { useToast } from '../components/toastContext';
import { esquemaDe, familiaDe, type CampoAtributo } from '../data/atributos';
import {
  crearProducto,
  ErrorApi,
  listarCategorias,
  MAX_BYTES_IMAGEN,
  reprocesarImagen,
  subirImagen,
  EXTENSIONES_ACEPTADAS,
} from '../services/api';
import { formatearBytes, formatearPrecio } from '../utils/formato';
import {
  FORMULARIO_VACIO,
  LIMITES,
  MENSAJES_API,
  validarImagen,
  validarTodo,
  type FormularioProducto,
} from '../utils/validacion';
import type { Categoria, ProductoCreado } from '../types';

type Fase = 'formulario' | 'creando' | 'subiendo' | 'publicado' | 'pendiente' | 'error';

const ETIQUETAS_FASE: Record<Fase, { texto: string; clases: string }> = {
  formulario: { texto: 'Listo para llenar', clases: 'bg-lienzo text-tinta-suave' },
  creando: { texto: 'Registrando en RDS y DynamoDB', clases: 'bg-primario-100 text-primario-700' },
  subiendo: { texto: 'Subiendo imagen y invocando Lambda', clases: 'bg-primario-100 text-primario-700' },
  publicado: { texto: 'PUBLICADO', clases: 'bg-pastel-verde text-primario-700' },
  pendiente: { texto: 'PENDIENTE', clases: 'bg-pastel-melocoton text-tinta' },
  error: { texto: 'ERROR', clases: 'bg-alerta/20 text-tinta' },
};

export function RegistrarProducto() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [formulario, setFormulario] = useState<FormularioProducto>(FORMULARIO_VACIO);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  const [fase, setFase] = useState<Fase>('formulario');
  const [yaIntento, setYaIntento] = useState(false);
  const [creado, setCreado] = useState<ProductoCreado | null>(null);
  const [progreso, setProgreso] = useState(0);
  const [errorGlobal, setErrorGlobal] = useState<ErrorApi | null>(null);
  // Guarda el paso que fallo para reintentar solo esa parte, sin duplicar el producto.
  const [pasoFallido, setPasoFallido] = useState<'crear' | 'imagen' | 'reprocesar' | null>(null);

  const toast = useToast();
  const inputArchivo = useRef<HTMLInputElement>(null);
  // URL.createObjectURL devuelve un blob URL que hay que revocar a mano.
  const urlPrevia = useRef<string | null>(null);

  useEffect(() => {
    let vigente = true;
    listarCategorias()
      .then((datos) => {
        if (vigente) setCategorias(datos);
      })
      .catch(() => {
        if (!vigente) return;
        toast.error(
          'No se pudieron cargar las categorias',
          'Sin categorias no se puede registrar. Reintenta recargando la pagina.',
        );
      });
    return () => {
      vigente = false;
    };
  }, [toast]);

  // La vista previa se crea al elegir el archivo y se libera al reemplazarlo
  // o al desmontar la vista.
  useEffect(
    () => () => {
      if (urlPrevia.current) URL.revokeObjectURL(urlPrevia.current);
    },
    [],
  );

  const categoriaActual = useMemo(
    () => categorias.find((c) => String(c.categoria_id) === formulario.categoria_id) ?? null,
    [categorias, formulario.categoria_id],
  );
  const esquemaActual: CampoAtributo[] = useMemo(
    () => esquemaDe(categoriaActual?.nombre ?? ''),
    [categoriaActual],
  );

  const validacion = useMemo(
    () => validarTodo(formulario, archivo, yaIntento, esquemaActual),
    [formulario, archivo, yaIntento, esquemaActual],
  );

  const bloqueado = fase === 'creando' || fase === 'subiendo' || fase === 'publicado';
  // El 409 lo reporta la API, asi que se guarda aparte de la validacion local.
  const [errorCodigo, setErrorCodigo] = useState<string | undefined>(undefined);

  const cambiar = useCallback(
    <K extends keyof FormularioProducto>(clave: K, valor: FormularioProducto[K]) => {
      setFormulario((actual) => ({ ...actual, [clave]: valor }));
    },
    [],
  );

  const cambiarAtributo = useCallback((clave: string, valor: string) => {
    setFormulario((actual) => ({
      ...actual,
      atributos: { ...actual.atributos, [clave]: valor },
    }));
  }, []);

  // Los atributos dependen de la familia, asi que al cambiar de categoria se
  // descartan los que ya no aplican en la nueva.
  const cambiarCategoria = useCallback((categoriaId: string) => {
    setFormulario((actual) => ({ ...actual, categoria_id: categoriaId, atributos: {} }));
  }, []);

  const elegirArchivo = useCallback((evento: React.ChangeEvent<HTMLInputElement>) => {
    const elegido = evento.target.files?.[0] ?? null;
    if (urlPrevia.current) URL.revokeObjectURL(urlPrevia.current);
    urlPrevia.current = elegido ? URL.createObjectURL(elegido) : null;
    setVistaPrevia(urlPrevia.current);
    setArchivo(elegido);
    setErrorGlobal(null);
  }, []);

  const subirImagenConProgreso = useCallback(
    async (id: number, imagen: File) => {
      setFase('subiendo');
      setProgreso(0);
      return subirImagen(id, imagen, (porcentaje) => setProgreso(porcentaje));
    },
    [],
  );

  const manejarErrorImagen = useCallback(
    (fallo: unknown) => {
      const apiError =
        fallo instanceof ErrorApi ? fallo : new ErrorApi(502, { mensaje: String(fallo) });
      setErrorGlobal(apiError);
      setPasoFallido('imagen');
      setFase('error');
      toast.error(
        MENSAJES_API[apiError.estado] ?? 'Error al procesar la imagen',
        apiError.mensaje,
      );
    },
    [toast],
  );

  const registrar = useCallback(
    async (evento: React.FormEvent) => {
      evento.preventDefault();
      setYaIntento(true);

      const { errores, hayErrores, datos } = validarTodo(formulario, archivo, true, esquemaActual);
      if (hayErrores) {
        setErrorCodigo(undefined);
        toast.error(
          'Revisa el formulario',
          `${Object.keys(errores).length} campo(s) por corregir.`,
        );
        return;
      }
      setErrorCodigo(undefined);

      // ---------- Paso 1: producto base en RDS + atributos en DynamoDB ----------
      setFase('creando');
      setErrorGlobal(null);

      let producto: ProductoCreado;
      try {
        producto = await crearProducto({
          ...datos,
          familia: familiaDe(categoriaActual?.nombre ?? '') || null,
        });
      } catch (fallo) {
        const apiError =
          fallo instanceof ErrorApi ? fallo : new ErrorApi(502, { mensaje: String(fallo) });
        setErrorGlobal(apiError);
        setPasoFallido('crear');
        setFase('error');

        // 409 es codigo duplicado: es el unico caso que se muestra en el campo.
        if (apiError.estado === 409) {
          setErrorCodigo('Ese codigo ya existe en RDS. Prueba con otro.');
          toast.error('Codigo de producto duplicado', 'Ya existe un producto con ese codigo en RDS.');
        } else {
          toast.error(
            MENSAJES_API[apiError.estado] ?? 'No se pudo registrar el producto',
            apiError.mensaje,
          );
        }
        return;
      }

      setCreado(producto);
      toast.mostrar({
        tono: 'info',
        titulo: `Producto ${producto.producto_id} registrado`,
        detalle: 'Queda PENDIENTE hasta que la miniatura este confirmada en S3.',
      });

      // ---------- Paso 2: imagen ----------
      if (!archivo) {
        setFase('pendiente');
        setPasoFallido(null);
        return;
      }

      try {
        const respuesta = await subirImagenConProgreso(producto.producto_id, archivo);
        setFase('publicado');
        setProgreso(100);
        toast.exito(
          'Producto publicado exitosamente',
          `producto_id ${respuesta.producto_id} · ${
            respuesta.dimensiones ? `${respuesta.dimensiones.ancho}x${respuesta.dimensiones.alto}` : 'miniatura generada'
          }`,
        );
      } catch (fallo) {
        manejarErrorImagen(fallo);
      }
    },
    [archivo, categoriaActual, formulario, manejarErrorImagen, esquemaActual, subirImagenConProgreso, toast],
  );

  const reintentar = useCallback(async () => {
    if (!creado) return;

    // Si el original nunca llego a S3, `reprocesar` responde 409; en ese caso
    // lo correcto es volver a subir el archivo, no reintentar a ciegas.
    if (pasoFallido === 'reprocesar' || (pasoFallido === 'imagen' && !archivo)) {
      setPasoFallido('reprocesar');
      setFase('subiendo');
      setErrorGlobal(null);
      try {
        const respuesta = await reprocesarImagen(creado.producto_id);
        setFase('publicado');
        toast.exito('Producto publicado exitosamente', `producto_id ${respuesta.producto_id}`);
      } catch (fallo) {
        const apiError = fallo instanceof ErrorApi ? fallo : new ErrorApi(502, { mensaje: String(fallo) });
        if (apiError.estado === 409 && archivo) {
          // No habia original guardado: se sube el archivo de nuevo.
          try {
            const respuesta = await subirImagenConProgreso(creado.producto_id, archivo);
            setFase('publicado');
            setPasoFallido(null);
            toast.exito('Producto publicado exitosamente', `producto_id ${respuesta.producto_id}`);
            return;
          } catch (otro) {
            manejarErrorImagen(otro);
            return;
          }
        }
        setErrorGlobal(apiError);
        setFase('error');
        toast.error('El reintento fallo', apiError.mensaje);
      }
      return;
    }

    if (pasoFallido === 'imagen' && archivo) {
      try {
        const respuesta = await subirImagenConProgreso(creado.producto_id, archivo);
        setFase('publicado');
        setProgreso(100);
        setPasoFallido(null);
        toast.exito('Producto publicado exitosamente', `producto_id ${respuesta.producto_id}`);
      } catch (fallo) {
        manejarErrorImagen(fallo);
      }
      return;
    }

    // El fallo fue en el paso 1: se reintenta el registro completo.
    setFormulario(FORMULARIO_VACIO);
    setArchivo(null);
    setCreado(null);
    setFase('formulario');
    setYaIntento(false);
    setErrorGlobal(null);
    setPasoFallido(null);
    toast.mostrar({
      tono: 'info',
      titulo: 'Formulario reiniciado',
      detalle: 'Intenta registrar de nuevo.',
    });
  }, [archivo, creado, manejarErrorImagen, pasoFallido, subirImagenConProgreso, toast]);

  const empezarDeNuevo = useCallback(() => {
    setFormulario(FORMULARIO_VACIO);
    setArchivo(null);
    setCreado(null);
    setFase('formulario');
    setYaIntento(false);
    setProgreso(0);
    setErrorGlobal(null);
    setPasoFallido(null);
    if (inputArchivo.current) inputArchivo.current.value = '';
  }, []);

  const estado = ETIQUETAS_FASE[fase];
  const erroresAtributos = validacion.errores.atributos ?? {};
  const errorImagenArchivo = validarImagen(archivo);

  // ---------- Vista de resultado: publicado, pendiente o error ----------
  // Se mantiene visible mientras se reintenta (`subiendo`) para no perder el
  // producto ya creado; solo se vuelve al formulario si el paso 1 fallo.
  if (creado && fase !== 'creando') {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <CabeceraPagina
          titulo={fase === 'publicado' ? 'Producto publicado' : 'Producto pendiente'}
          descripcion={
            fase === 'publicado'
              ? 'La miniatura quedo confirmada en DynamoDB y en S3, y el API actualizo RDS a PUBLICADO.'
              : fase === 'pendiente'
                ? 'El producto quedo registrado pero sin imagen, por eso todavia no aparece en el catalogo.'
                : 'El producto quedo registrado y no se perdio nada. Puedes reintentar solo la parte que fallo.'
          }
          icono={fase === 'publicado' ? <PackageCheck className="h-5 w-5" aria-hidden="true" /> : <Database className="h-5 w-5" aria-hidden="true" />}
        />

        <div className="rounded-tarjeta border border-borde bg-superficie p-6 shadow-tarjeta">
          <div className="flex items-center justify-between gap-3">
            <span className={`etiqueta ${estado.clases}`}>{estado.texto}</span>
            {creado && (
              <span className="font-mono text-xs text-tinta-suave">
                producto_id {creado.producto_id}
              </span>
            )}
          </div>

          {creado && (
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-tinta-suave">Codigo</dt>
                <dd className="font-mono font-bold text-tinta">{creado.codigo}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-tinta-suave">Nombre</dt>
                <dd className="font-bold text-tinta">{creado.nombre}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-tinta-suave">Precio</dt>
                <dd className="font-bold text-tinta">{formatearPrecio(creado.precio)}</dd>
              </div>
            </dl>
          )}

          {fase === 'subiendo' && (
            <div className="mt-4 space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-lienzo">
                <div
                  className="h-full rounded-full bg-primario-300 transition-[width] duration-200"
                  style={{ width: `${progreso}%` }}
                />
              </div>
              <p className="flex items-center gap-2 text-xs text-tinta-suave">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Subiendo imagen {progreso}% e invocando la Lambda de forma sincrona
              </p>
            </div>
          )}

          {errorGlobal && (
            <div
              role="alert"
              className="mt-4 flex gap-3 rounded-control border border-alerta/40 bg-alerta/10 p-4"
            >
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-alerta" aria-hidden="true" />
              <div className="text-sm">
                <p className="font-bold text-tinta">{MENSAJES_API[errorGlobal.estado] ?? 'Error'}</p>
                <p className="mt-1 text-tinta-suave">{errorGlobal.mensaje}</p>
                <p className="mt-1 font-mono text-xs text-tinta-suave">
                  {errorGlobal.estado} · {errorGlobal.paso} · {errorGlobal.codigo}
                </p>
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            {fase === 'publicado' && creado && (
              <BotonEnlace to={`/productos/${creado.producto_id}`} variante="primario">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Ver detalle
              </BotonEnlace>
            )}
            {fase === 'error' && (
              <Boton variante="secundario" onClick={() => void reintentar()}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Reintentar procesamiento
              </Boton>
            )}
            {fase === 'pendiente' && (
              <Boton variante="primario" onClick={() => inputArchivo.current?.click()}>
                <Upload className="h-4 w-4" aria-hidden="true" />
                Cargar imagen ahora
              </Boton>
            )}
            <Boton variante="contorno" onClick={empezarDeNuevo}>
              Registrar otro producto
            </Boton>
            <BotonEnlace to="/catalogo" variante="fantasma">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Volver al catalogo
            </BotonEnlace>
          </div>
        </div>

        {/* Input oculto reutilizable para subir la imagen despues del registro */}
        <input
          ref={inputArchivo}
          type="file"
          accept={EXTENSIONES_ACEPTADAS}
          className="sr-only"
          onChange={elegirArchivo}
        />
      </div>
    );
  }

  // ---------- Vista de formulario ----------
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <CabeceraPagina
        titulo="Registrar producto"
        descripcion="El registro y la carga de la imagen son dos pasos separados: el producto nace PENDIENTE y solo pasa a PUBLICADO cuando la miniatura esta verificada en S3."
        icono={<PackageCheck className="h-5 w-5" aria-hidden="true" />}
        acciones={
          <span className={`etiqueta ${estado.clases}`}>
            {(fase === 'creando' || fase === 'subiendo') && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            )}
            {estado.texto}
          </span>
        }
      />

      {errorGlobal && !creado && (
        <div role="alert" className="flex gap-3 rounded-tarjeta border border-alerta/40 bg-alerta/10 p-4">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-alerta" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-bold text-tinta">{MENSAJES_API[errorGlobal.estado] ?? 'Error'}</p>
            <p className="mt-1 text-tinta-suave">{errorGlobal.mensaje}</p>
            <p className="mt-1 font-mono text-xs text-tinta-suave">
              {errorGlobal.estado} · {errorGlobal.paso} · {errorGlobal.codigo}
            </p>
          </div>
        </div>
      )}

      <form onSubmit={registrar} noValidate className="space-y-4">
        <ContenedorSeccion
          titulo="Datos del producto"
          descripcion="Estos campos van a PostgreSQL en RDS, dentro de una transaccion."
        >
          <CampoTexto
            etiqueta="Codigo"
            requerido
            disabled={bloqueado}
            value={formulario.codigo}
            onChange={(e) => {
              cambiar('codigo', e.target.value);
              setErrorCodigo(undefined);
            }}
            placeholder="LOM-0021"
            maxLength={LIMITES.codigo}
            ayuda={`Unico en RDS. Maximo ${LIMITES.codigo} caracteres.`}
            error={errorCodigo ?? validacion.errores.codigo}
            valido={yaIntento && !errorCodigo && !validacion.errores.codigo && formulario.codigo.trim() !== ''}
          />

          <CampoTexto
            etiqueta="Nombre"
            requerido
            disabled={bloqueado}
            value={formulario.nombre}
            onChange={(e) => cambiar('nombre', e.target.value)}
            placeholder="Teclado mecanico 87 teclas"
            maxLength={LIMITES.nombre}
            ayuda={`Maximo ${LIMITES.nombre} caracteres.`}
            error={validacion.errores.nombre}
            valido={yaIntento && !validacion.errores.nombre && formulario.nombre.trim() !== ''}
          />

          <CampoArea
            etiqueta="Descripcion"
            requerido
            disabled={bloqueado}
            value={formulario.descripcion}
            onChange={(e) => cambiar('descripcion', e.target.value)}
            placeholder="Teclado mecanico con estructura aluminum y switches lineales"
            maxLength={LIMITES.descripcion}
            ayuda={`${formulario.descripcion.length}/${LIMITES.descripcion}. La API la exige no vacia.`}
            error={validacion.errores.descripcion}
            valido={yaIntento && !validacion.errores.descripcion && formulario.descripcion.trim() !== ''}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <CampoTexto
              etiqueta="Precio"
              requerido
              disabled={bloqueado}
              type="number"
              step="0.01"
              min="0.01"
              value={formulario.precio}
              onChange={(e) => cambiar('precio', e.target.value)}
              placeholder="249.90"
              ayuda="Minimo 0.01. RDS exige precio >= 0."
              error={validacion.errores.precio}
              valido={yaIntento && !validacion.errores.precio && formulario.precio.trim() !== ''}
            />

            <CampoSelect
              etiqueta="Categoria"
              requerido
              disabled={bloqueado}
              value={formulario.categoria_id}
              onChange={(e) => cambiarCategoria(e.target.value)}
              marcador={<option value="">Selecciona una categoria</option>}
              opciones={categorias.map((c) => ({
                valor: String(c.categoria_id),
                texto: c.nombre,
              }))}
              ayuda="Los atributos variables se piden segun la familia."
              error={validacion.errores.categoria_id}
              valido={yaIntento && !validacion.errores.categoria_id && formulario.categoria_id !== ''}
            />
          </div>
        </ContenedorSeccion>

        {esquemaActual.length > 0 && (
          <ContenedorSeccion
            titulo={`Atributos de ${categoriaActual?.nombre}`}
            descripcion="Estos campos no tienen columna fija: se guardan como mapa en DynamoDB con clave de particion producto_id."
          >
            {esquemaActual.map((campo) =>
              campo.tipo === 'seleccion' ? (
                <CampoSelect
                  key={campo.clave}
                  etiqueta={campo.etiqueta}
                  requerido={campo.requerido}
                  disabled={bloqueado}
                  value={formulario.atributos[campo.clave] ?? ''}
                  onChange={(e) => cambiarAtributo(campo.clave, e.target.value)}
                  marcador={<option value="">Sin especificar</option>}
                  opciones={(campo.opciones ?? []).map((opcion) => ({
                    valor: opcion,
                    texto: opcion,
                  }))}
                  ayuda={campo.ayuda}
                  error={erroresAtributos[campo.clave]}
                />
              ) : (
                <CampoTexto
                  key={campo.clave}
                  etiqueta={campo.etiqueta}
                  requerido={campo.requerido}
                  disabled={bloqueado}
                  type={campo.tipo === 'numero' ? 'number' : 'text'}
                  value={formulario.atributos[campo.clave] ?? ''}
                  onChange={(e) => cambiarAtributo(campo.clave, e.target.value)}
                  placeholder={campo.tipo === 'numero' ? 'Ejemplo: 87' : 'Ejemplo: valor'}
                  ayuda={campo.ayuda}
                  error={erroresAtributos[campo.clave]}
                />
              ),
            )}
          </ContenedorSeccion>
        )}

        <ContenedorSeccion
          titulo="Fotografia"
          descripcion="La API sube el archivo a S3 e invoca la Lambda de forma sincrona para generar la miniatura de hasta 300x300 px."
        >
          <div
            className={`rounded-tarjeta border-2 border-dashed p-5 transition duration-200 ${
              errorImagenArchivo
                ? 'border-alerta bg-alerta/5'
                : 'border-borde bg-lienzo hover:border-primario-300'
            }`}
          >
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              {vistaPrevia ? (
                <img
                  src={vistaPrevia}
                  alt="Vista previa de la imagen seleccionada"
                  className="h-24 w-32 shrink-0 rounded-control border border-borde object-cover"
                />
              ) : (
                <span className="flex h-24 w-32 shrink-0 items-center justify-center rounded-control border border-borde bg-superficie text-tinta-suave">
                  <ImageOff className="h-7 w-7" aria-hidden="true" />
                </span>
              )}

              <div className="min-w-0 flex-1">
                <input
                  ref={inputArchivo}
                  type="file"
                  accept={EXTENSIONES_ACEPTADAS}
                  onChange={elegirArchivo}
                  className="block w-full text-sm text-tinta file:mr-3 file:cursor-pointer file:rounded-control file:border-0 file:bg-primario-200 file:px-4 file:py-2 file:text-sm file:font-bold file:text-tinta file:transition file:duration-200 hover:file:bg-primario-300"
                />
                <p className="mt-2 text-xs text-tinta-suave">
                  Solo JPEG o PNG, maximo {formatearBytes(MAX_BYTES_IMAGEN)}. Es opcional: si no
                  eliges archivo el producto queda PENDIENTE y podras cargarla despues.
                </p>
                {errorImagenArchivo && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-alerta">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {errorImagenArchivo}
                  </p>
                )}
              </div>
            </div>
          </div>
        </ContenedorSeccion>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <BotonEnlace to="/catalogo" variante="fantasma">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Cancelar
          </BotonEnlace>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            {yaIntento && validacion.hayErrores && (
              <p className="text-center text-xs font-semibold text-alerta sm:text-right">
                {Object.keys(validacion.errores).length} campo(s) por corregir
              </p>
            )}
            <Boton type="submit" variante="primario" cargando={fase === 'creando' || fase === 'subiendo'}>
              {(fase === 'creando' || fase === 'subiendo') && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Registrar producto
            </Boton>
          </div>
        </div>
      </form>
    </div>
  );
}