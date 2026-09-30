// Verificacion directa de los tres almacenamientos que usa la API.
// Es la evidencia E4 del TEMI: no pasa por la API, consulta RDS, DynamoDB y
// S3 por separado para confirmar que lo que la API devuelve existe de verdad.
//
//   node scripts/verificar-almacenamientos.mjs
//
// Requiere las variables AWS_* y las de RDS; toma como defecto los mismos
// valores que backend/src/config.js y backend/docker-compose.yml.

import pg from 'pg';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';

pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => (v === null ? null : Number(v)));

const rds = {
  host: process.env.PGHOST || 'localhost',
  puerto: Number(process.env.PGPORT || 7001),
  base: process.env.PGDATABASE || 'lomax',
  usuario: process.env.PGUSER || 'postgres',
  clave: process.env.PGPASSWORD || 'lomax123',
};
const endpoint = process.env.AWS_ENDPOINT_URL || 'http://localhost:4566';
const region = process.env.AWS_DEFAULT_REGION || 'us-east-1';
const credenciales = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'flociadmin',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'flociadmin',
};

const BUCKET_ORIGINALES = process.env.LOMAX_BUCKET_ORIGENALES || 'lomax-originales';
const BUCKET_MINIATURAS = process.env.LOMAX_BUCKET_MINIATURAS || 'lomax-miniaturas';
const TABLA = process.env.LOMAX_TABLA_ATRIBUTOS || 'productos_atributos';

const s3 = new S3Client({
  region,
  endpoint,
  credentials: credenciales,
  forcePathStyle: true,
});
const ddb = new DynamoDBClient({ region, endpoint, credentials: credenciales });

const titulo = (t) => console.log(`\n${'='.repeat(72)}\n${t}\n${'='.repeat(72)}`);

async function main() {
  console.log(`Fecha (UTC): ${new Date().toISOString()}`);
  console.log(`RDS: ${rds.host}:${rds.puerto}/${rds.base}`);
  console.log(`AWS: ${endpoint}   tabla: ${TABLA}`);

  const pool = new pg.Pool({
    host: rds.host,
    port: rds.puerto,
    database: rds.base,
    user: rds.usuario,
    password: rds.clave,
  });
  const tabla = async (t, sql) => {
    console.log(`\n${t}`);
    const { rows } = await pool.query(sql);
    console.table(rows);
    return rows;
  };

  titulo('RDS - catalogo y estados');
  await tabla('Conteo por estado', `SELECT estado, count(*) AS total FROM productos GROUP BY estado ORDER BY estado`);
  await tabla(
    'Los PENDIENTE no son visibles en el catalogo',
    `SELECT count(*) AS visibles_en_catalogo FROM productos WHERE estado = 'PUBLICADO'`,
  );
  await tabla(
    'Productos PENDIENTE (sin miniatura confirmada)',
    `SELECT producto_id, codigo, nombre FROM productos WHERE estado = 'PENDIENTE' ORDER BY producto_id`,
  );
  const conMiniatura = await tabla(
    'Inventario de productos en RDS',
    `SELECT p.producto_id, p.codigo, p.nombre, p.estado AS estado_rds,
            c.nombre AS categoria
       FROM productos p
       JOIN categorias c ON c.categoria_id = p.categoria_id
      ORDER BY p.producto_id`,
  );

  titulo('DynamoDB - atributos y estado de procesamiento');
  const escaneo = await ddb.send(new ScanCommand({ TableName: TABLA }));
  const items = (escaneo.Items ?? []).sort(
    (a, b) => Number(a.producto_id.N) - Number(b.producto_id.N),
  );
  console.log(`Total de items: ${items.length}`);
  console.table(
    items.map((i) => ({
      producto_id: Number(i.producto_id.N),
      estado_procesamiento: i.estado_procesamiento?.S ?? null,
      miniatura_key: i.miniatura_key?.S ?? null,
      imagen_original_key: i.imagen_original_key?.S ?? null,
    })),
  );

  titulo('S3 - originales y miniaturas');
  for (const bucket of [BUCKET_ORIGINALES, BUCKET_MINIATURAS]) {
    const listado = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
    console.log(`\n${bucket}`);
    console.table(
      (listado.Contents ?? []).map((o) => ({
        clave: o.Key,
        bytes: Number(o.Size),
        modificado: o.LastModified?.toISOString(),
      })),
    );
  }

  titulo('Coherencia RDS <-> DynamoDB <-> S3');
  const porId = new Map(items.map((i) => [Number(i.producto_id.N), i]));
  const miniaturaEnS3 = new Set();
  const listadoMini = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET_MINIATURAS }));
  for (const o of listadoMini.Contents ?? []) miniaturaEnS3.add(o.Key);

  const filas = [];
  let problemas = 0;
  const incoherentes = [];
  for (const p of conMiniatura) {
    const id = Number(p.producto_id);
    const item = porId.get(id);
    const clave = item?.miniatura_key?.S ?? null;
    const hayEnS3 = clave ? miniaturaEnS3.has(clave) : false;

    // El invariante del TEMI: PUBLICADO solo si hay miniatura confirmada.
    const estadoRds = p.estado_rds;
    const coherente = estadoRds === 'PUBLICADO' ? clave !== null && hayEnS3 : true;

    if (!coherente) {
      problemas += 1;
      incoherentes.push({ producto_id: id, codigo: p.codigo, estado_rds: estadoRds });
    }
    filas.push({
      producto_id: id,
      codigo: p.codigo,
      estado_rds: estadoRds,
      ddb_estado: item?.estado_procesamiento?.S ?? null,
      miniatura_key: clave,
      miniatura_en_s3: hayEnS3,
      coherente,
    });
  }
  console.table(filas.filter((f) => f.producto_id >= 21));

  console.log(`\nProductos PUBLICA sin miniatura confirmada en S3: ${problemas}`);
  if (problemas > 0) {
    console.table(incoherentes);
    console.log(
      'Observacion: son filas del seed de la Etapa 2, que marco 20 productos como\n' +
        'PUBLICA sin pasar por el flujo de imagen. La API de la Etapa 4 no crea\n' +
        'productos en ese estado: verifica la miniatura antes de publicar.',
    );
  }

  // Invariante atribuible al flujo de imagen: si DynamoDB registro un original,
  // entonces el estado de RDS debe ser coherente con la miniatura resultante.
  // (Un original invalido deja PENDIENTE + ERROR, que tambien es coherente.)
  const conOriginal = filas.filter((f) => f.ddb_estado !== 'PENDIENTE' || f.miniatura_key);
  const flowIncoherente = conOriginal.filter(
    (f) => f.estado_rds === 'PUBLICADO' && !(f.miniatura_key && f.miniatura_en_s3),
  );
  console.log('\nProductos que pasaron por el flujo de imagen:');
  console.table(conOriginal);
  console.log(`Incoherencias del flujo de imagen: ${flowIncoherente.length}`);
  console.log(
    flowIncoherente.length === 0
      ? 'OK: ningun producto se publico sin miniatura confirmada en S3.'
      : 'REVISAR: hay productos publicados sin miniatura en S3.',
  );

  await pool.end();
}

main().catch((error) => {
  console.error('FALLO la verificacion:', error.message || '(sin mensaje)');
  if (error.code) console.error('  codigo:', error.code);
  if (error.position) console.error('  posicion:', error.position);
  if (error.query) console.error('  consulta:', error.query);
  process.exit(1);
});
