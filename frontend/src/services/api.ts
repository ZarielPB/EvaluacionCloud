import axios, { AxiosError, type AxiosProgressEvent } from 'axios';

import type {
  Categoria,
  DatosProducto,
  DetalleErrorApi,
  ImagenPublicada,
  ProductoCreado,
  ProductoDetalle,
  ProductoResumen,
  RespuestaSalud,
} from '../types';

/**
 * Base de la API. Con `VITE_API_URL=/api` la peticion es del mismo origen y la
 * resuelve el proxy Nginx (produccion) o el servidor de Vite (desarrollo).
 * Con la URL absoluta `http://localhost:8080/api` es la misma ruta del proxy.
 */
export const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

/** Limite que impone la API (LOMAX_MAX_BYTES) para no enviar archivos que sera rechazados. */
export const MAX_BYTES_IMAGEN = 5 * 1024 * 1024;

export const TIPOS_IMAGEN_ACEPTADOS = ['image/jpeg', 'image/png'];

export const EXTENSIONES_ACEPTADAS = '.jpg,.jpeg,.png';

/**
 * Error de la API con el paso y el codigo que el enunciado exige documentar.
 * La API siempre responde { error: { mensaje, paso, codigo, detalle? } }.
 */
export class ErrorApi extends Error {
  readonly estado: number;
  readonly paso: string;
  readonly codigo: string;
  readonly detalle?: Record<string, unknown>;

  constructor(estado: number, cuerpo: Partial<DetalleErrorApi> | null) {
    super(cuerpo?.mensaje ?? MENSAJES_POR_ESTADO[estado] ?? 'Ocurrio un error inesperado');
    this.name = 'ErrorApi';
    this.estado = estado;
    this.paso = cuerpo?.paso ?? 'desconocido';
    this.codigo = cuerpo?.codigo ?? 'error_no_catalogado';
    this.detalle = cuerpo?.detalle;
  }

  /** `400 · validacion_entrada · campos_obligatorios` */
  get etiqueta(): string {
    return `${this.estado} · ${this.paso} · ${this.codigo}`;
  }

  /** Alias en espanol del mensaje, con el mismo nombre que usa la API. */
  get mensaje(): string {
    return this.message;
  }
}

const MENSAJES_POR_ESTADO: Record<number, string> = {
  400: 'Los datos enviados no son validos. Revisa el formulario.',
  404: 'No se encontro el recurso solicitado.',
  409: 'El recurso ya existe o no puede procesarse en este estado.',
  413: 'El archivo supera el maximo de 5 MiB.',
  415: 'Solo se admiten archivos JPEG o PNG.',
  502: 'Un servicio dependiente fallo. Intenta de nuevo.',
  503: 'Un servicio esta temporalmente caido. Intenta en unos segundos.',
};

const cliente = axios.create({
  baseURL: API_BASE,
  timeout: 30_000,
  headers: { Accept: 'application/json' },
});

function extraerCuerpo(error: unknown): Partial<DetalleErrorApi> | null {
  const axiosError = error as AxiosError<{ error?: Partial<DetalleErrorApi> }>;
  const cuerpo = axiosError?.response?.data?.error;
  return cuerpo ?? null;
}

function normalizar(error: unknown): ErrorApi {
  if (error instanceof ErrorApi) return error;

  const axiosError = error as AxiosError;
  if (axiosError?.response) {
    return new ErrorApi(axiosError.response.status, extraerCuerpo(error));
  }
  if (axiosError?.request) {
    return new ErrorApi(503, {
      mensaje: 'No se pudo contactar con la API. Revisa que la Etapa 4 este levantada.',
      paso: 'red',
      codigo: 'api_no_alcanzable',
    });
  }
  return new ErrorApi(502, {
    mensaje: axiosError?.message ?? 'Fallo inesperado al consumir la API.',
    paso: 'cliente',
    codigo: 'error_inesperado',
  });
}

export async function pedir<T>(ejecutar: () => Promise<{ data: T }>): Promise<T> {
  try {
    const { data } = await ejecutar();
    return data;
  } catch (error) {
    throw normalizar(error);
  }
}

/** GET /categorias */
export function listarCategorias(): Promise<Categoria[]> {
  return pedir(() => cliente.get<Categoria[]>('/categorias'));
}

/** GET /productos (solo PUBLICADOS) */
export function listarProductos(): Promise<ProductoResumen[]> {
  return pedir(() => cliente.get<ProductoResumen[]>('/productos'));
}

/** GET /productos/{id} (admite tambien PENDIENTE) */
export function obtenerProducto(id: number): Promise<ProductoDetalle> {
  return pedir(() => cliente.get<ProductoDetalle>(`/productos/${id}`));
}

/** POST /productos -> 201 con el producto en PENDIENTE */
export function crearProducto(datos: DatosProducto): Promise<ProductoCreado> {
  return pedir(() => cliente.post<ProductoCreado>('/productos', datos));
}

/**
 * POST /productos/{id}/imagen
 * El campo multipart debe llamarse `imagen`; la API lo exige y responde
 * 400 `archivo_ausente` en caso contrario.
 */
export function subirImagen(
  id: number,
  archivo: File,
  alCambiarProgreso?: (porcentaje: number) => void,
): Promise<ImagenPublicada> {
  const formulario = new FormData();
  formulario.append('imagen', archivo);

  return pedir(() =>
    cliente.post<ImagenPublicada>(`/productos/${id}/imagen`, formulario, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60_000,
      onUploadProgress: (event: AxiosProgressEvent) => {
        if (alCambiarProgreso && event.total) {
          alCambiarProgreso(Math.round((event.loaded * 100) / event.total));
        }
      },
    }),
  );
}

/** POST /productos/{id}/reprocesar (idempotente) */
export function reprocesarImagen(id: number): Promise<ImagenPublicada> {
  return pedir(() => cliente.post<ImagenPublicada>(`/productos/${id}/reprocesar`));
}

/** GET /salud */
export function consultarSalud(): Promise<RespuestaSalud> {
  return pedir(() => cliente.get<RespuestaSalud>('/salud'));
}

/**
 * URL de la miniatura. Se usa en `src`, no con fetch, para que la descarga de
 * E5 sea una peticion del navegador al proxy y no un origen externo de S3.
 */
export function urlImagen(productoId: number): string {
  return `${API_BASE}/productos/${productoId}/imagen`;
}
