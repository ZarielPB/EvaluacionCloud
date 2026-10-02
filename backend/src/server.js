import express from 'express';
import { ListBucketsCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { GetFunctionCommand, LambdaClient } from '@aws-sdk/client-lambda';

import { config } from './config.js';
import { verificarRds, pool } from './db.js';
import { s3, dynamo } from './aws.js';
import { manejadorDeErrores, noEncontrado, registrar } from './middleware.js';
import { ApiError } from './errors.js';
import categoriasRouter from './routes/categorias.js';
import productosRouter from './routes/productos.js';
import imagenRouter from './routes/imagen.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const lambdaAdmin = new LambdaClient({
  region: config.aws.region,
  endpoint: config.aws.endpoint,
});

// Reporta los cuatro servicios de los que depende la API. La Etapa 2 y la 3
// las demostraron por separado; esto prueba que la API los ve juntos.
app.get('/salud', async (_req, res) => {
  const salida = { estado: 'ok', servicios: {} };

  try {
    const info = await verificarRds();
    salida.servicios.rds = {
      ok: true,
      base: info.base,
      version: info.version.split(' ').slice(0, 2).join(' '),
    };
  } catch (error) {
    salida.estado = 'degradado';
    salida.servicios.rds = { ok: false, error: error.message };
  }

  try {
    const { Buckets = [] } = await s3.send(new ListBucketsCommand({}));
    const nombres = Buckets.map((b) => b.Name);
    salida.servicios.s3 = {
      ok: nombres.includes(config.s3.originales) && nombres.includes(config.s3.miniaturas),
      buckets: nombres,
    };
    if (!salida.servicios.s3.ok) salida.estado = 'degradado';
  } catch (error) {
    salida.estado = 'degradado';
    salida.servicios.s3 = { ok: false, error: error.message };
  }

  try {
    const info = await dynamo.send(new DescribeTableCommand({ TableName: config.dynamodb.tabla }));
    salida.servicios.dynamodb = {
      ok: info.Table?.TableStatus === 'ACTIVE',
      tabla: config.dynamodb.tabla,
      estado: info.Table?.TableStatus ?? null,
      items: info.Table?.ItemCount ?? null,
    };
    if (!salida.servicios.dynamodb.ok) salida.estado = 'degradado';
  } catch (error) {
    salida.estado = 'degradado';
    salida.servicios.dynamodb = { ok: false, error: error.message };
  }

  try {
    const info = await lambdaAdmin.send(
      new GetFunctionCommand({ FunctionName: config.lambda.funcion }),
    );
    salida.servicios.lambda = {
      ok: info.Configuration?.State === 'Active',
      funcion: config.lambda.funcion,
      estado: info.Configuration?.State ?? null,
    };
    if (!salida.servicios.lambda.ok) salida.estado = 'degradado';
  } catch (error) {
    salida.estado = 'degradado';
    salida.servicios.lambda = { ok: false, error: error.message };
  }

  res.status(salida.estado === 'ok' ? 200 : 503).json(salida);
});

// Raiz util para quien abra la API en el navegador.
app.get('/', (_req, res) => {
  res.json({
    servicio: 'LOMAX SA - API de catalogo (Etapa 4)',
    endpoints: [
      'GET /categorias',
      'POST /productos',
      'POST /productos/{id}/imagen',
      'POST /productos/{id}/reprocesar',
      'GET /productos',
      'GET /productos/{id}',
      'GET /productos/{id}/imagen',
      'GET /salud',
    ],
  });
});

app.use('/categorias', categoriasRouter);
app.use('/productos', productosRouter);
app.use('/productos', imagenRouter);

app.use(noEncontrado);
app.use(manejadorDeErrores);

const servidor = app.listen(config.puerto, config.host, () => {
  console.log(`[api] escuchando en http://${config.host}:${config.puerto}`);
  console.log(`[api] rds ${config.rds.host}:${config.rds.puerto}/${config.rds.base}`);
  console.log(`[api] aws ${config.aws.endpoint}`);
});

for (const senal of ['SIGTERM', 'SIGINT']) {
  process.on(senal, () => {
    console.log(`[api] ${senal} recibido, cerrando`);
    servidor.close(() => {
      pool.end().finally(() => process.exit(0));
    });
  });
}
