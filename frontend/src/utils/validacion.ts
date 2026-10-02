import { MAX_BYTES_IMAGEN, TIPOS_IMAGEN_ACEPTADOS } from '../services/api';
import { type CampoAtributo } from '../data/atributos';
import { formatearBytes } from './formato';

export const LIMITES = {
  codigo: 50,
  nombre: 100,
  descripcion: 500,
  precioMinimo: 0.01,
} as const;

export interface FormularioProducto {
  codigo: string;
  nombre: string;
  descripcion: string;
  precio: string;
  categoria_id: string;
  atributos: Record<string, string>;
}

export const FORMULARIO_VACIO: FormularioProducto = {
  codigo: '',
  nombre: '',
  descripcion: '',
  precio: '',
  categoria_id: '',
  atributos: {},
};

export type ErroresFormulario = Omit<
  Partial<Record<keyof FormularioProducto, string>>,
  'atributos'
> & {
  imagen?: string;
  atributos?: Record<string, string>;
};

/**
 * Valida un solo campo. Se usa en tiempo real mientras se escribe, asi que
 * solo se considera invalido lo que ya tiene contenido: un campo vacio se
 * reporta solo cuando se intento enviar el formulario.
 */
export function validarCampo(
  clave: keyof FormularioProducto,
  valor: string,
  yaIntento: boolean,
): string | undefined {
  const limpio = valor.trim();

  if (limpio === '') {
    return yaIntento ? 'Este campo es obligatorio' : undefined;
  }

  if (clave === 'codigo') {
    if (limpio.length > LIMITES.codigo) {
      return `Maximo ${LIMITES.codigo} caracteres (van ${limpio.length})`;
    }
    if (!/^[A-Za-z0-9._-]+$/.test(limpio)) {
      return 'Solo letras, numeros, punto, guion y guion bajo';
    }
    return undefined;
  }

  if (clave === 'nombre' && limpio.length > LIMITES.nombre) {
    return `Maximo ${LIMITES.nombre} caracteres (van ${limpio.length})`;
  }

  if (clave === 'descripcion' && limpio.length > LIMITES.descripcion) {
    return `Maximo ${LIMITES.descripcion} caracteres (van ${limpio.length})`;
  }

  if (clave === 'precio') {
    const numero = Number(limpio);
    if (!Number.isFinite(numero)) return 'El precio debe ser un numero';
    if (numero < LIMITES.precioMinimo) {
      return `El precio debe ser al menos ${LIMITES.precioMinimo}`;
    }
    return undefined;
  }

  return undefined;
}

/**
 * Valida los atributos variables del esquema dado.
 * Se recibe el esquema ya resuelto porque la categoria del formulario se
 * conoce por ID (`1`) mientras que los esquemas estan indexados por nombre
 * (`PERIFERICOS`).
 */
export function validarAtributos(
  esquema: CampoAtributo[],
  atributos: Record<string, string>,
  yaIntento: boolean,
): Record<string, string> {
  const errores: Record<string, string> = {};

  for (const campo of esquema) {
    const valor = (atributos[campo.clave] ?? '').trim();
    if (valor === '') {
      if (campo.requerido && yaIntento) {
        errores[campo.clave] = `${campo.etiqueta} es obligatorio para esta categoria`;
      }
      continue;
    }
    if (campo.tipo === 'numero') {
      const numero = Number(valor);
      if (!Number.isFinite(numero)) {
        errores[campo.clave] = 'Debe ser un numero';
        continue;
      }
      if (campo.minimo !== undefined && numero < campo.minimo) {
        errores[campo.clave] = `Minimo ${campo.minimo}`;
        continue;
      }
      if (campo.maximo !== undefined && numero > campo.maximo) {
        errores[campo.clave] = `Maximo ${campo.maximo}`;
        continue;
      }
    }
    if (campo.opciones && !campo.opciones.includes(valor)) {
      errores[campo.clave] = 'Elija una de las opciones disponibles';
    }
  }

  return errores;
}

/** Valida el archivo antes de enviarlo, replicando lo que hace la API. */
export function validarImagen(archivo: File | null): string | undefined {
  if (!archivo) return undefined;
  if (!TIPOS_IMAGEN_ACEPTADOS.includes(archivo.type)) {
    return 'Formato no permitido. Solo JPEG o PNG.';
  }
  if (archivo.size > MAX_BYTES_IMAGEN) {
    return `La imagen excede 5 MB (${formatearBytes(archivo.size)})`;
  }
  if (archivo.size === 0) return 'El archivo esta vacio';
  return undefined;
}

export interface ResultadoValidacion {
  errores: ErroresFormulario;
  hayErrores: boolean;
  datos: {
    codigo: string;
    nombre: string;
    descripcion: string;
    precio: number;
    categoria_id: number;
    atributos: Record<string, string | number | boolean>;
  };
}

/** Convierte el formulario en el cuerpo que espera POST /productos. */
export function validarTodo(
  formulario: FormularioProducto,
  archivo: File | null,
  yaIntento: boolean,
  esquema: CampoAtributo[],
): ResultadoValidacion {
  const errores: ErroresFormulario = {};

  for (const clave of ['codigo', 'nombre', 'descripcion', 'precio', 'categoria_id'] as const) {
    const error = validarCampo(clave, formulario[clave], yaIntento);
    if (error) errores[clave] = error;
  }

  const erroresAtributos = validarAtributos(esquema, formulario.atributos, yaIntento);
  if (Object.keys(erroresAtributos).length > 0) errores.atributos = erroresAtributos;

  const errorImagen = validarImagen(archivo);
  if (errorImagen) errores.imagen = errorImagen;

  // Solo viaja al payload lo que pertenece a la familia elegida: asi una
  // categoria no guarda atributos de otra.
  const atributos: Record<string, string | number | boolean> = {};
  for (const campo of esquema) {
    const valor = (formulario.atributos[campo.clave] ?? '').trim();
    if (valor === '') continue;
    atributos[campo.clave] = campo.tipo === 'numero' ? Number(valor) : valor;
  }

  return {
    errores,
    hayErrores: Object.keys(errores).length > 0,
    datos: {
      codigo: formulario.codigo.trim(),
      nombre: formulario.nombre.trim(),
      descripcion: formulario.descripcion.trim(),
      precio: Number(formulario.precio),
      categoria_id: Number(formulario.categoria_id),
      atributos,
    },
  };
}

/** Mensaje que se muestra segun el codigo HTTP que devolvio la API. */
export const MENSAJES_API: Record<number, string> = {
  400: 'La API rechazo los datos. Revisa los campos marcados.',
  409: 'El codigo de producto ya existe en RDS.',
  413: 'La imagen excede el maximo de 5 MB.',
  415: 'Formato no permitido: solo JPEG o PNG.',
  502: 'S3 o la Lambda fallaron al procesar la imagen. El producto quedo PENDIENTE.',
  503: 'Un servicio esta caido. El producto quedo PENDIENTE, no se perdio nada.',
};