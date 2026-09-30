import { ApiError, desdeErrorPostgres, desdeErrorAws } from './errors.js';
import { config } from './config.js';

const NIVELES = { debug: 10, info: 20, warn: 30, error: 40 };

function registrar(nivel, mensaje, extra = {}) {
  if ((NIVELES[nivel] ?? 20) < (NIVELES[config.log.nivel] ?? 20)) return;
  const linea = { ts: new Date().toISOString(), nivel, mensaje, ...extra };
  const salida = JSON.stringify(linea);
  if (nivel === 'error') console.error(salida);
  else console.log(salida);
}

// Detecta si un error sin envoltura viene de pg o del SDK de AWS.
// No se adivina por la ruta: casi toda llamada a AWS ocurre bajo /productos,
// y reportar "fallo de base de datos" cuando caigo DynamoDB seria falso.
function pareceErrorDePg(error) {
  if (error?.name === 'DatabaseError' || error?.name === 'AggregateError') return true;
  if (typeof error?.severity === 'string' || typeof error?.routine === 'string') return true;
  const codigo = String(error?.code ?? '');
  return codigo.length === 5 && /^[0-9A-Z]+$/.test(codigo);
}

function seeminglyEsAws(error) {
  return Boolean(error?.$metadata || error?.$fault || error?.Code || error?.name === 'TimeoutError');
}

// El TEMI exige "documentar la respuesta que identifica el paso fallido",
// asi que el cuerpo del error siempre incluye paso y codigo de la regla.
export function manejadorDeErrores(error, req, res, _next) {
  let apiError;
  if (error instanceof ApiError) {
    apiError = error;
  } else if (seeminglyEsAws(error) && !pareceErrorDePg(error)) {
    apiError = desdeErrorAws(error, 'aws');
  } else {
    apiError = desdeErrorPostgres(error);
  }

  const cuerpo = {
    error: {
      mensaje: apiError.mensaje,
      paso: apiError.paso,
      codigo: apiError.codigo,
    },
  };
  if (apiError.detalle) cuerpo.error.detalle = apiError.detalle;

  const nivel = apiError.estado >= 500 ? 'error' : 'warn';
  registrar(nivel, 'peticion fallida', {
    metodo: req.method,
    ruta: req.originalUrl,
    estado: apiError.estado,
    paso: apiError.paso,
    codigo: apiError.codigo,
  });

  res.status(apiError.estado).json(cuerpo);
}

export function noEncontrado(req, res) {
  res.status(404).json({
    error: {
      mensaje: `No existe el recurso ${req.method} ${req.path}`,
      paso: 'ruta',
      codigo: 'ruta_no_encontrada',
    },
  });
}

function cuerpoDeImagen(valor) {
  if (Buffer.isBuffer(valor)) return valor;
  if (typeof valor === 'string') return Buffer.from(valor, 'base64');
  if (valor && Buffer.isBuffer(valor.buffer)) return valor.buffer;
  return null;
}

// 413 se comprueba por content-length antes de leer el stream: leer 100 MB
// para despues rechazarlos desperdicia memoria del proceso.
export function limiteDeCarga(req, res, next) {
  const bruto = Number(req.headers['content-length'] ?? 0);
  const maximo = config.s3.maxBytes + 1024 * 1024; // +1 MiB para el multipart
  if (bruto > maximo) {
    return next(
      new ApiError(413, `El archivo supera el maximo de ${config.s3.maxBytes} bytes`, {
        paso: 'validacion_entrada',
        codigo: 'archivo_demasiado_grande',
        detalle: { content_length: bruto, maximo },
      }),
    );
  }
  return next();
}

// Valida que el multipart traiga exactamente un archivo.
export function requiereArchivo(req, res, next) {
  const archivo = req.file;
  if (!archivo) {
    return next(
      new ApiError(400, 'No se recibio ningun archivo en el campo "imagen"', {
        paso: 'validacion_entrada',
        codigo: 'archivo_ausente',
      }),
    );
  }
  const bytes = cuerpoDeImagen(archivo);
  if (!bytes || bytes.length === 0) {
    return next(
      new ApiError(400, 'El archivo recibido esta vacio', {
        paso: 'validacion_entrada',
        codigo: 'archivo_vacio',
      }),
    );
  }
  req.bytesImagen = bytes;
  return next();
}

// El MIME declarado por el cliente no es evidencia: la Lambda valida los
// bytes reales con Pillow. Aqui solo se descarta lo evidentemente erroneo.
const MIME_PERMITIDOS = new Set(['image/jpeg', 'image/png']);

export function validaTipoDeclarado(req, res, next) {
  const tipo = (req.file?.mimetype ?? '').toLowerCase();
  if (MIME_PERMITIDOS.has(tipo)) return next();
  return next(
    new ApiError(415, 'El tipo declarado no es una imagen admitida (JPEG o PNG)', {
      paso: 'validacion_entrada',
      codigo: 'tipo_no_admitido',
      detalle: { content_type_declarado: req.file?.mimetype ?? null },
    }),
  );
}

export function validaTamanoReal(req, res, next) {
  const bytes = req.bytesImagen?.length ?? 0;
  if (bytes > config.s3.maxBytes) {
    return next(
      new ApiError(413, `El archivo supera el maximo de ${config.s3.maxBytes} bytes`, {
        paso: 'validacion_entrada',
        codigo: 'archivo_demasiado_grande',
        detalle: { bytes_recibidos: bytes, maximo: config.s3.maxBytes },
      }),
    );
  }
  return next();
}

export { registrar };
