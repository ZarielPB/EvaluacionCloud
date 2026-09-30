import { Router } from 'express';
import multer from 'multer';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { GetCommand } from '@aws-sdk/lib-dynamodb';

import { config } from '../config.js';
import { consultarUno } from '../db.js';
import { s3, dynamo, invocarMiniatura } from '../aws.js';
import { ApiError, desdeErrorLambda, desdeErrorAws } from '../errors.js';
import {
  limiteDeCarga,
  requiereArchivo,
  validaTipoDeclarado,
  validaTamanoReal,
  registrar,
} from '../middleware.js';

export const imagenRouter = Router();

// multer en memoria: el archivo no toca disco. El limite se fija por debajo
// del maximo del enunciado para que el corte ocurra antes de leer 5 MiB+ de RAM.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.s3.maxBytes, files: 1 },
  fileFilter(_req, archivo, cb) {
    const permitidos = new Set(['image/jpeg', 'image/png']);
    if (!permitidos.has((archivo.mimetype ?? '').toLowerCase())) {
      const error = new ApiError(415, 'Solo se admiten archivos JPEG o PNG', {
        paso: 'validacion_entrada',
        codigo: 'tipo_no_admitido',
        detalle: { content_type_declarado: archivo.mimetype ?? null },
      });
      return cb(error);
    }
    return cb(null, true);
  },
});

const claveOriginal = (id) => `${config.s3.prefijoOriginales}${id}.png`;
const claveMiniatura = (id) => `${config.s3.prefijoMiniaturas}${id}.jpg`;

async function obtenerProducto(id) {
  const producto = await consultarUno(
    `SELECT producto_id, codigo, nombre, estado
       FROM productos
      WHERE producto_id = $1`,
    [id],
  );
  if (!producto) {
    throw new ApiError(404, `No existe un producto con producto_id ${id}`, {
      paso: 'rds',
      codigo: 'producto_no_encontrado',
      detalle: { producto_id: id },
    });
  }
  return producto;
}

async function obtenerItem(id) {
  let respuesta;
  try {
    respuesta = await dynamo.send(
      new GetCommand({ TableName: config.dynamodb.tabla, Key: { producto_id: Number(id) } }),
    );
  } catch (error) {
    throw desdeErrorAws(error, 'dynamodb');
  }
  return respuesta.Item ?? null;
}

// Publica en RDS solo cuando DynamoDB confirma miniatura y atributos.
// Es el requisito del enunciado: "Solo cambia a PUBLICADO cuando confirma
// atributos y miniatura disponibles".
async function publicarSiCorresponde(id) {
  const item = await obtenerItem(id);
  const listo = item?.estado_procesamiento === 'LISTA' && Boolean(item?.miniatura_key);
  if (!listo) {
    return { publicado: false, item };
  }
  // consultarUno devuelve la fila directamente, no un envoltorio {rows}.
  const actualizado = await consultarUno(
    `UPDATE productos SET estado = 'PUBLICADO' WHERE producto_id = $1 RETURNING estado`,
    [id],
  );
  return { publicado: true, estado: actualizado?.estado ?? null, item };
}

function bytesDelFlujo(cuerpo) {
  return new Promise((resolver, rechazar) => {
    const trozos = [];
    cuerpo.on('data', (t) => trozos.push(t));
    cuerpo.on('end', () => resolver(Buffer.concat(trozos)));
    cuerpo.on('error', rechazar);
  });
}

// POST /productos/{id}/imagen
imagenRouter.post(
  '/:id/imagen',
  limiteDeCarga,
  upload.single('imagen'),
  requiereArchivo,
  validaTamanoReal,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new ApiError(400, 'El identificador de producto no es valido', {
          paso: 'validacion_entrada',
          codigo: 'id_invalido',
        });
      }

      await obtenerProducto(id);
      const bytes = req.bytesImagen;
      const clave = claveOriginal(id);

      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: config.s3.originales,
            Key: clave,
            Body: bytes,
            ContentType: req.file.mimetype,
          }),
        );
      } catch (error) {
        throw desdeErrorAws(error, 's3_originales');
      }

      const resultado = await invocarMiniatura(id, config.s3.originales, clave);

      // FunctionError = fallo real del servicio. statusCode 422 = la imagen
      // fue rechazada. No son lo mismo y el TEMI los separa.
      if (resultado.functionError || resultado.cuerpo?.statusCode !== 200) {
        const error = desdeErrorLambda(resultado);
        // El producto permanece PENDIENTE: el error queda en DynamoDB
        // como error_motivo y el endpoint de reprocesar permite reintentar.
        registrar('warn', 'la imagen fue rechazada, el producto sigue PENDIENTE', {
          producto_id: id,
          estado_api: error.estado,
          paso: error.paso,
        });
        throw error;
      }

      const publicacion = await publicarSiCorresponde(id);

      if (!publicacion.publicado) {
        throw new ApiError(502, 'La miniatura se genero pero el producto no pudo publicarse', {
          paso: 'publicacion',
          codigo: 'publicacion_incompleta',
          detalle: {
            estado_procesamiento: publicacion.item?.estado_procesamiento ?? null,
            miniatura_key: publicacion.item?.miniatura_key ?? null,
          },
        });
      }

      res.status(200).json({
        producto_id: id,
        estado: 'PUBLICADO',
        miniatura_key: publicacion.item.miniatura_key,
        dimensiones: resultado.cuerpo?.dimensiones ?? null,
        mensaje: 'Imagen cargada y producto publicado',
      });
    } catch (error) {
      next(error);
    }
  },
);

// POST /productos/{id}/reprocesar
// Reinvoca Lambda sobre el original ya guardado. Como la clave de la miniatura
// se deriva solo del producto_id, repetir no duplica objetos.
imagenRouter.post('/:id/reprocesar', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ApiError(400, 'El identificador de producto no es valido', {
        paso: 'validacion_entrada',
        codigo: 'id_invalido',
      });
    }

    await obtenerProducto(id);
    const item = await obtenerItem(id);

    if (!item?.imagen_original_key) {
      throw new ApiError(409, 'El producto no tiene una imagen original para reprocesar', {
        paso: 'reproceso',
        codigo: 'sin_original',
        detalle: { producto_id: id, estado_procesamiento: item?.estado_procesamiento ?? null },
      });
    }

    const resultado = await invocarMiniatura(
      id,
      item.bucket_original ?? config.s3.originales,
      item.imagen_original_key,
    );

    if (resultado.functionError || resultado.cuerpo?.statusCode !== 200) {
      throw desdeErrorLambda(resultado);
    }

    const publicacion = await publicarSiCorresponde(id);
    if (!publicacion.publicado) {
      throw new ApiError(502, 'La miniatura se genero pero el producto no pudo publicarse', {
        paso: 'publicacion',
        codigo: 'publicacion_incompleta',
        detalle: { estado_procesamiento: publicacion.item?.estado_procesamiento ?? null },
      });
    }

    res.status(200).json({
      producto_id: id,
      estado: 'PUBLICADO',
      miniatura_key: publicacion.item.miniatura_key,
      reprocesado: true,
      mensaje: 'Imagen reprocesada y producto publicado',
    });
  } catch (error) {
    next(error);
  }
});

// GET /productos/{id}/imagen -> bytes de la miniatura con Content-Type correcto.
imagenRouter.get('/:id/imagen', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ApiError(400, 'El identificador de producto no es valido', {
        paso: 'validacion_entrada',
        codigo: 'id_invalido',
      });
    }

    let item = null;
    try {
      item = await obtenerItem(id);
    } catch (error) {
      throw desdeErrorAws(error, 'dynamodb');
    }

    const clave = item?.miniatura_key;
    if (!clave) {
      throw new ApiError(404, 'El producto no tiene miniatura disponible', {
        paso: 's3',
        codigo: 'miniatura_no_disponible',
        detalle: {
          producto_id: id,
          estado_procesamiento: item?.estado_procesamiento ?? null,
        },
      });
    }

    let objeto;
    try {
      objeto = await s3.send(
        new GetObjectCommand({
          Bucket: item.bucket_miniatura ?? config.s3.miniaturas,
          Key: clave,
        }),
      );
    } catch (error) {
      throw desdeErrorAws(error, 's3_miniaturas');
    }

    const bytes = await bytesDelFlujo(objeto.Body);
    const tipo = objeto.ContentType ?? 'image/jpeg';

    res.setHeader('Content-Type', tipo);
    res.setHeader('Content-Length', bytes.length);
    res.setHeader('Cache-Control', 'max-age=86400');
    if (objeto.ETag) res.setHeader('ETag', objeto.ETag);
    res.status(200).end(bytes);
  } catch (error) {
    next(error);
  }
});

export default imagenRouter;
