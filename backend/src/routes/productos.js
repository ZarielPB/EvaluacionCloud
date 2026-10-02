import { Router } from 'express';
import { PutCommand, GetCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { config } from '../config.js';
import { consultar, consultarUno, conTransaccion } from '../db.js';
import { dynamo } from '../aws.js';
import { ApiError, desdeErrorAws } from '../errors.js';

export const productosRouter = Router();

const FAMILIAS_POR_CATEGORIA = {
  PERIFERICOS: 'PERIFERICOS',
  PANTALLAS: 'PANTALLAS',
  AUDIO: 'AUDIO',
};

// Longitudes reales de scripts/init-rds.sql. Validarlas aqui evita que un
// VARCHAR desbordado llegue a Postgres y salga como 500 `22001`.
const LONGITUDES = {
  codigo: 20,
  nombre: 120,
};

function validarRegistro(cuerpo) {
  const faltantes = [];
  if (!cuerpo?.codigo || String(cuerpo.codigo).trim() === '') faltantes.push('codigo');
  if (!cuerpo?.nombre || String(cuerpo.nombre).trim() === '') faltantes.push('nombre');
  if (!cuerpo?.descripcion || String(cuerpo.descripcion).trim() === '') faltantes.push('descripcion');
  if (cuerpo?.precio === undefined || cuerpo?.precio === null || cuerpo?.precio === '') {
    faltantes.push('precio');
  }
  if (cuerpo?.categoria_id === undefined || cuerpo?.categoria_id === null) {
    faltantes.push('categoria_id');
  }
  if (faltantes.length > 0) {
    throw new ApiError(400, 'Faltan campos obligatorios del producto', {
      paso: 'validacion_entrada',
      codigo: 'campos_obligatorios',
      detalle: { campos_faltantes: faltantes },
    });
  }

  const precio = Number(cuerpo.precio);
  if (!Number.isFinite(precio)) {
    throw new ApiError(400, 'El precio debe ser un numero', {
      paso: 'validacion_entrada',
      codigo: 'precio_no_numerico',
      detalle: { recibido: cuerpo.precio },
    });
  }

  const codigo = String(cuerpo.codigo).trim();
  const nombre = String(cuerpo.nombre).trim();

  const demasiadoLargo = [];
  if (codigo.length > LONGITUDES.codigo) {
    demasiadoLargo.push({ campo: 'codigo', longitud: codigo.length, maximo: LONGITUDES.codigo });
  }
  if (nombre.length > LONGITUDES.nombre) {
    demasiadoLargo.push({ campo: 'nombre', longitud: nombre.length, maximo: LONGITUDES.nombre });
  }
  if (demasiadoLargo.length > 0) {
    throw new ApiError(400, 'Un valor supera la longitud maxima permitida', {
      paso: 'validacion_entrada',
      codigo: 'valor_demasiado_largo',
      detalle: { campos: demasiadoLargo },
    });
  }

  return {
    codigo,
    nombre,
    descripcion: String(cuerpo.descripcion).trim(),
    precio,
    categoria_id: Number(cuerpo.categoria_id),
  };
}

function validarAtributos(atributos) {
  if (atributos === undefined || atributos === null) return {};
  if (typeof atributos !== 'object' || Array.isArray(atributos)) {
    throw new ApiError(400, 'Los atributos deben ser un objeto', {
      paso: 'validacion_entrada',
      codigo: 'atributos_invalidos',
    });
  }
  const atributosLimpios = {};
  for (const [clave, valor] of Object.entries(atributos)) {
    if (valor === null || valor === undefined) continue;
    if (typeof clave !== 'string' || clave.trim() === '') continue;
    // DynamoDB no admite claves de mapa vacias ni valores sin tipo.
    atributosLimpios[clave.trim()] =
      typeof valor === 'object' ? JSON.stringify(valor) : valor;
  }
  return atributosLimpios;
}

// POST /productos
// Registra el producto como PENDIENTE en RDS y guarda sus atributos en
// DynamoDB. El estado PENDIENTE es lo que impide que aparezca en el catalogo
// hasta que la imagen se procese: es el requisito central del enunciado.
productosRouter.post('/', async (req, res, next) => {
  try {
    const datos = validarRegistro(req.body);
    const atributos = validarAtributos(req.body.atributos);
    const familia = req.body.familia ? String(req.body.familia).toUpperCase() : null;

    const producto = await conTransaccion(async (cliente) => {
      // La categoria se resuelve en la misma transaccion: la FK ya la exige,
      // y de paso da el nombre real para etiquetar el item de DynamoDB.
      const { rows: categorias } = await cliente.query(
        `SELECT nombre FROM categorias WHERE categoria_id = $1`,
        [datos.categoria_id],
      );
      if (categorias.length === 0) {
        throw new ApiError(400, 'La categoria indicada no existe', {
          paso: 'validacion_entrada',
          codigo: 'fk_productos_categoria',
          detalle: { categoria_id: datos.categoria_id },
        });
      }

      const { rows } = await cliente.query(
        `INSERT INTO productos (codigo, nombre, descripcion, precio, categoria_id, estado)
         VALUES ($1, $2, $3, $4, $5, 'PENDIENTE')
         RETURNING producto_id, codigo, nombre, descripcion, precio, categoria_id,
                   fecha_creacion, estado`,
        [datos.codigo, datos.nombre, datos.descripcion, datos.precio, datos.categoria_id],
      );
      return { ...rows[0], categoria: categorias[0].nombre };
    });

    // Si el cliente no manda `familia` se deriva del nombre de la categoria.
    // Antes se indexaba el mapa con `undefined`, que siempre daba `undefined`
    // y dejaba el item de DynamoDB con `familia: null`.
    const familiaResuelta =
      familia ?? FAMILIAS_POR_CATEGORIA[producto.categoria] ?? producto.categoria;

    try {
      await dynamo.send(
        new PutCommand({
          TableName: config.dynamodb.tabla,
          Item: {
            producto_id: Number(producto.producto_id),
            familia: familiaResuelta,
            atributos,
            imagen_original_key: null,
            miniatura_key: null,
            estado_procesamiento: 'PENDIENTE',
            actualizado_en: new Date().toISOString(),
          },
        }),
      );
    } catch (error) {
      // Sin item en DynamoDB el producto quedaria huerfano: no tiene
      // atributos y tampoco podria publicarse. Se revierte el registro RDS.
      throw new ApiError(
        503,
        'No se pudieron guardar los atributos del producto; el registro fue revertido',
        {
          paso: 'dynamodb',
          codigo: 'atributos_no_guardados',
          detalle: { motivo: error.message, producto_id_revertido: producto.producto_id },
        },
      );
    }

    res.status(201).json({
      producto_id: producto.producto_id,
      codigo: producto.codigo,
      nombre: producto.nombre,
      descripcion: producto.descripcion,
      precio: Number(producto.precio),
      categoria_id: producto.categoria_id,
      fecha_creacion: producto.fecha_creacion,
      estado: producto.estado,
      mensaje: 'Producto registrado. Queda PENDIENTE hasta que se cargue su imagen.',
    });
  } catch (error) {
    next(error);
  }
});

// GET /productos -> solo PUBLICADOS, combinando RDS, DynamoDB y S3.
productosRouter.get('/', async (_req, res, next) => {
  try {
    const publicados = await consultar(
      `SELECT p.producto_id, p.codigo, p.nombre, p.descripcion, p.precio,
              p.categoria_id, p.fecha_creacion, p.estado, c.nombre AS categoria
         FROM productos p
         JOIN categorias c ON c.categoria_id = p.categoria_id
        WHERE p.estado = 'PUBLICADO'
        ORDER BY p.producto_id`,
    );

    const ids = publicados.map((p) => Number(p.producto_id));
    if (ids.length === 0) return res.json([]);

    let respuestas = null;
    try {
      respuestas = await dynamo.send(
        new BatchGetCommand({
          RequestItems: {
            [config.dynamodb.tabla]: {
              Keys: ids.map((id) => ({ producto_id: id })),
            },
          },
        }),
      );
    } catch (error) {
      throw desdeErrorAws(error, 'dynamodb');
    }

    const porProducto = new Map();
    for (const item of respuestas.Responses?.[config.dynamodb.tabla] ?? []) {
      porProducto.set(Number(item.producto_id), item);
    }

    res.json(
      publicados.map((p) => {
        const id = Number(p.producto_id);
        const item = porProducto.get(id);
        return {
          ...p,
          precio: Number(p.precio),
          atributos: item?.atributos ?? {},
          miniatura_key: item?.miniatura_key ?? null,
          imagen_disponible: Boolean(item?.miniatura_key),
        };
      }),
    );
  } catch (error) {
    next(error);
  }
});

// GET /productos/{id} -> permite verificar tambien los registros PENDIENTE.
productosRouter.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ApiError(400, 'El identificador de producto no es valido', {
        paso: 'validacion_entrada',
        codigo: 'id_invalido',
        detalle: { recibido: req.params.id },
      });
    }

    const producto = await consultarUno(
      `SELECT p.producto_id, p.codigo, p.nombre, p.descripcion, p.precio,
              p.categoria_id, p.fecha_creacion, p.estado, c.nombre AS categoria
         FROM productos p
         JOIN categorias c ON c.categoria_id = p.categoria_id
        WHERE p.producto_id = $1`,
      [id],
    );

    if (!producto) {
      throw new ApiError(404, `No existe un producto con producto_id ${id}`, {
        paso: 'rds',
        codigo: 'producto_no_encontrado',
        detalle: { producto_id: id },
      });
    }

    let item = null;
    try {
      const respuesta = await dynamo.send(
        new GetCommand({ TableName: config.dynamodb.tabla, Key: { producto_id: id } }),
      );
      item = respuesta.Item ?? null;
    } catch (error) {
      // El detalle del producto vive en RDS; si DynamoDB cae se responde
      // 502/503 en vez de devolver atributos vacios que parecerian reales.
      throw desdeErrorAws(error, 'dynamodb');
    }

    res.json({
      ...producto,
      precio: Number(producto.precio),
      atributos: item?.atributos ?? {},
      miniatura_key: item?.miniatura_key ?? null,
      imagen_original_key: item?.imagen_original_key ?? null,
      estado_procesamiento: item?.estado_procesamiento ?? null,
      error_motivo: item?.error_motivo ?? null,
      imagen_disponible: Boolean(item?.miniatura_key),
    });
  } catch (error) {
    next(error);
  }
});

export default productosRouter;
