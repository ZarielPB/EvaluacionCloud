/**
 * Tipos que reflejan el contrato real de la API de la Etapa 4
 * (docs/ETAPA_4_BACKEND_API.md y backend/src/routes/).
 */

export type EstadoProducto = 'PENDIENTE' | 'PUBLICADO';

export type EstadoProcesamiento = 'PENDIENTE' | 'LISTA' | 'ERROR';

export interface Categoria {
  categoria_id: number;
  nombre: string;
  descripcion: string;
}

export interface ProductoResumen {
  producto_id: number;
  codigo: string;
  nombre: string;
  descripcion: string;
  precio: number;
  categoria_id: number;
  categoria: string;
  fecha_creacion: string;
  estado: EstadoProducto;
  atributos: Record<string, string | number | boolean>;
  miniatura_key: string | null;
  imagen_disponible: boolean;
}

export interface ProductoDetalle extends ProductoResumen {
  imagen_original_key: string | null;
  estado_procesamiento: EstadoProcesamiento | null;
  error_motivo: string | null;
}

export interface ProductoCreado {
  producto_id: number;
  codigo: string;
  nombre: string;
  descripcion: string;
  precio: number;
  categoria_id: number;
  fecha_creacion: string;
  estado: EstadoProducto;
  mensaje: string;
}

export interface ImagenPublicada {
  producto_id: number;
  estado: EstadoProducto;
  miniatura_key: string;
  dimensiones: { ancho: number; alto: number } | null;
  reprocesado?: boolean;
  mensaje: string;
}

export interface DatosProducto {
  codigo: string;
  nombre: string;
  descripcion: string;
  precio: number;
  categoria_id: number;
  atributos: Record<string, string | number | boolean>;
  /** Lo usa la API para etiquetar el item de DynamoDB. */
  familia?: string | null;
}

export interface ServicioSalud {
  ok: boolean;
  [clave: string]: unknown;
}

export interface RespuestaSalud {
  estado: 'ok' | 'degradado';
  servicios: Record<string, ServicioSalud>;
}

/** Cuerpo de error normalizado por la API: { error: { mensaje, paso, codigo, detalle } }. */
export interface DetalleErrorApi {
  mensaje: string;
  paso: string;
  codigo: string;
  detalle?: Record<string, unknown>;
}
