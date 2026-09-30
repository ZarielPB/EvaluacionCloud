// Mapeo de errores a codigos HTTP.
// El enunciado (TEMI Etapa 4) distingue el error del usuario del fallo de
// un servicio dependiente, y esa distincion se decide aqui y no en las rutas.

export class ApiError extends Error {
  constructor(estado, mensaje, opciones = {}) {
    super(mensaje);
    this.name = 'ApiError';
    // super() define .message; el contrato HTTP usa .mensaje en español.
    this.mensaje = mensaje;
    this.estado = estado;
    this.paso = opciones.paso ?? null;
    this.codigo = opciones.codigo ?? null;
    this.detalle = opciones.detalle ?? null;
  }
}

// SQLSTATE -> HTTP. El nombre de la constraint importa tanto como el
// SQLSTATE: dos constraints distintas pueden compartir el mismo codigo.
const RESTRICCIONES = {
  uq_productos_codigo: {
    estado: 409,
    mensaje: 'Ya existe un producto registrado con ese codigo',
  },
  chk_productos_precio: {
    estado: 400,
    mensaje: 'El precio no puede ser negativo',
  },
  chk_productos_estado: {
    estado: 400,
    mensaje: 'El estado debe ser PENDIENTE o PUBLICADO',
  },
  fk_productos_categoria: {
    estado: 400,
    mensaje: 'La categoria indicada no existe',
  },
  uq_categorias_nombre: {
    estado: 409,
    mensaje: 'Ya existe una categoria con ese nombre',
  },
};

const SQLSTATE_GENERICOS = {
  '23502': { estado: 400, mensaje: 'Faltan campos obligatorios' },
  '23503': { estado: 400, mensaje: 'Referencia a un registro que no existe' },
  '23505': { estado: 409, mensaje: 'El registro ya existe' },
  '23514': { estado: 400, mensaje: 'El valor no cumple la restriccion del catalogo' },
  '22P02': { estado: 400, mensaje: 'Formato de dato invalido' },
  '22003': { estado: 400, mensaje: 'El valor numerico esta fuera de rango' },
};

function nombreDeRestriccion(error) {
  const directa = error?.constraint;
  if (directa) return directa;
  const detalle = String(error?.detail ?? error?.message ?? '');
  const coincidencia = detalle.match(/constraint "([a-z0-9_]+)"/i);
  return coincidencia ? coincidencia[1] : null;
}

export function desdeErrorPostgres(error) {
  if (error instanceof ApiError) return error;

  const codigo = error?.code;
  const constraint = nombreDeRestriccion(error);

  if (constraint && RESTRICCIONES[constraint]) {
    const regla = RESTRICCIONES[constraint];
    return new ApiError(regla.estado, regla.mensaje, {
      paso: 'validacion_rds',
      codigo: constraint,
      detalle: { sqlstate: codigo },
    });
  }

  if (codigo && SQLSTATE_GENERICOS[codigo]) {
    const regla = SQLSTATE_GENERICOS[codigo];
    return new ApiError(regla.estado, regla.mensaje, {
      paso: 'validacion_rds',
      codigo: constraint,
      detalle: { sqlstate: codigo },
    });
  }

  // PostgreSQL inalcanzable: el enunciado pide 503 cuando un servicio
  // dependiente falla, no un 500 que sugiere un bug de la API.
  const conectividad = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH'];
  if (conectividad.includes(codigo) || codigo === '57P01' || codigo === '53300') {
    return new ApiError(503, 'El servicio de base de datos no esta disponible', {
      paso: 'rds',
      codigo: codigo ?? null,
    });
  }

  return new ApiError(500, 'Error interno al procesar la solicitud', {
    paso: 'desconocido',
    codigo: codigo ?? null,
    detalle: { mensaje_original: error?.message ?? null },
  });
}

// Lambda (Etapa 3): devuelve statusCode 422 sin lanzar excepcion cuando la
// imagen es invalida, y solo marca FunctionError ante un fallo real. Mezclar
// los dos haria que un JPEG roto pareciera una caida del servicio.
export function desdeErrorLambda(resultado) {
  const { functionError, cuerpo, statusCode } = resultado ?? {};

  if (functionError) {
    return new ApiError(502, 'El procesamiento de la imagen fallo por un error del servicio', {
      paso: 'lambda',
      codigo: functionError,
      detalle: { status_code_transporte: statusCode },
    });
  }

  const codigoDevuelto = cuerpo?.statusCode;

  if (codigoDevuelto === 422) {
    return new ApiError(415, 'El archivo enviado no es una imagen valida', {
      paso: 'lambda',
      codigo: 'imagen_invalida',
      detalle: { motivo: cuerpo?.detalle ?? null },
    });
  }

  if (codigoDevuelto === 400) {
    return new ApiError(400, 'El evento enviado a la funcion no es valido', {
      paso: 'lambda',
      codigo: 'evento_invalido',
      detalle: { motivo: cuerpo?.detalle ?? null },
    });
  }

  if (typeof codigoDevuelto === 'number' && codigoDevuelto >= 500) {
    return new ApiError(502, 'El procesamiento de la imagen fallo por un error del servicio', {
      paso: 'lambda',
      codigo: cuerpo?.detalle ?? null,
    });
  }

  return new ApiError(502, 'Respuesta inesperada del procesamiento de imagen', {
    paso: 'lambda',
    codigo: 'respuesta_inesperada',
    detalle: { status_code: statusCode, cuerpo: cuerpo ?? null },
  });
}

export function desdeErrorAws(error, paso = 'aws') {
  if (error instanceof ApiError) return error;

  const nombre = error?.name ?? '';
  const codigo = error?.Code ?? error?.code ?? error?.$metadata?.httpStatusCode ?? '';

  if (nombre === 'NoSuchKey' || codigo === 'NoSuchKey' || codigo === 404) {
    return new ApiError(404, 'El archivo solicitado no existe', { paso, codigo: 'no_such_key' });
  }

  if (nombre === 'ResourceNotFoundException' || codigo === 'ResourceNotFoundException') {
    return new ApiError(404, 'El recurso solicitado no existe', { paso, codigo });
  }

  if (['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH'].includes(String(codigo))) {
    return new ApiError(503, 'Un servicio de AWS no esta disponible', { paso, codigo });
  }

  if (codigo === 'TimeoutError' || nombre === 'TimeoutError') {
    return new ApiError(504, 'El servicio tardo demasiado en responder', { paso, codigo });
  }

  return new ApiError(502, 'Fallo la comunicacion con un servicio de AWS', {
    paso,
    codigo: codigo || nombre || null,
    detalle: { mensaje_original: error?.message ?? null },
  });
}
