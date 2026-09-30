// =====================================================================
// LOMAX SA | Etapa 2 - Carga de atributos variables en DynamoDB
// Archivo : scripts/seed-dynamodb.mjs
// Autor   : jeysi702
// Servicio: Amazon DynamoDB (FLOCI)
// Ejecutar: pnpm --dir scripts run seed:dynamodb
//
// Modelo: clave de particion producto_id (Number), IGUAL al
// producto_id de RDS. Entre los dos servicios NO hay clave foranea:
// la relacion se verifica desde la API (tema 7.3).
//
// Idempotente: usa PutItem, que SOBRESCRIBE el item completo con la
// misma clave. Se puede ejecutar N veces sin duplicar ni fallar.
//
// Conjuntos de atributos distintos, porque no todos los productos
// piden lo mismo (TEMI: un teclado pide conexion y distribucion; una
// pantalla, pulgadas y resolucion):
//   - PERIFERICOS -> conexion, distribucion
//   - PANTALLAS   -> pulgadas, resolucion
//   - AUDIO       -> tipo, conectividad
// Las referencias de imagen quedan PENDIENTES hasta la Etapa 3 (S3 +
// Lambda), que actualizara miniatura_key y estado_procesamiento.
// =====================================================================

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, ScanCommand }
  from '@aws-sdk/lib-dynamodb';

const ENDPOINT = process.env.AWS_ENDPOINT_URL ?? 'http://localhost:4566';
const REGION = process.env.AWS_DEFAULT_REGION ?? 'us-east-1';
const TABLA = 'productos_atributos';

const cliente = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    endpoint: ENDPOINT,
    region: REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'flociadmin',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'flociadmin',
    },
  }),
  { marshallOptions: { removeUndefinedValues: true } },
);

console.log('=============================================================');
console.log(' LOMAX SA | Etapa 2 - Carga de DynamoDB');
console.log('=============================================================');
console.log(`Endpoint : ${ENDPOINT}`);
console.log(`Region   : ${REGION}`);
console.log(`Tabla    : ${TABLA}`);
console.log('');

const items = [
  { producto_id: 1,  familia: 'PERIFERICOS', atributos: { conexion: 'Bluetooth 5.1', distribucion: 'ANSI 75%' } },
  { producto_id: 2,  familia: 'PERIFERICOS', atributos: { conexion: 'USB cable', distribucion: 'ergonomico vertical' } },
  { producto_id: 3,  familia: 'PERIFERICOS', atributos: { conexion: 'USB cable', distribucion: 'TKL 87 teclas' } },
  { producto_id: 4,  familia: 'PERIFERICOS', atributos: { conexion: 'Bluetooth', distribucion: 'ergonomico vertical' } },
  { producto_id: 5,  familia: 'PERIFERICOS', atributos: { conexion: 'Bluetooth 5.0', distribucion: 'compacto 79 teclas' } },
  { producto_id: 6,  familia: 'PERIFERICOS', atributos: { conexion: 'USB cable', distribucion: 'ergonomico derecho' } },
  { producto_id: 7,  familia: 'PERIFERICOS', atributos: { conexion: 'USB cable', distribucion: 'ANSI 104 teclas' } },
  { producto_id: 21, familia: 'PERIFERICOS', atributos: { conexion: 'USB cable', distribucion: 'compacto' } },

  { producto_id: 8,  familia: 'PANTALLAS', atributos: { pulgadas: 24,   resolucion: '1920x1080' } },
  { producto_id: 9,  familia: 'PANTALLAS', atributos: { pulgadas: 23.8, resolucion: '1920x1080' } },
  { producto_id: 10, familia: 'PANTALLAS', atributos: { pulgadas: 27,   resolucion: '2560x1440' } },
  { producto_id: 11, familia: 'PANTALLAS', atributos: { pulgadas: 24,   resolucion: '1920x1080' } },
  { producto_id: 12, familia: 'PANTALLAS', atributos: { pulgadas: 300,  resolucion: '1920x1080', tipo: 'proyector' } },
  { producto_id: 13, familia: 'PANTALLAS', atributos: { pulgadas: 27,   resolucion: '3840x2160' } },
  { producto_id: 14, familia: 'PANTALLAS', atributos: { pulgadas: 50,   resolucion: '3840x2160' } },
  { producto_id: 22, familia: 'PANTALLAS', atributos: { pulgadas: 24,   resolucion: '1920x1080' } },

  { producto_id: 15, familia: 'AUDIO', atributos: { tipo: 'over-ear',    conectividad: 'Bluetooth 5.2' } },
  { producto_id: 16, familia: 'AUDIO', atributos: { tipo: 'speaker',     conectividad: 'Bluetooth' } },
  { producto_id: 17, familia: 'AUDIO', atributos: { tipo: 'gaming',      conectividad: 'USB + Jack 3.5' } },
  { producto_id: 18, familia: 'AUDIO', atributos: { tipo: 'microfono',   conectividad: 'USB' } },
  { producto_id: 19, familia: 'AUDIO', atributos: { tipo: 'sistema 2.1', conectividad: 'Bluetooth' } },
  { producto_id: 20, familia: 'AUDIO', atributos: { tipo: 'in-ear',      conectividad: 'Bluetooth 5.3' } },
];

for (const item of items) {
  item.imagen_original_key = null;
  item.miniatura_key = null;
  item.estado_procesamiento = 'PENDIENTE';
  item.actualizado_en = new Date().toISOString();
}

console.log(`Items a escribir: ${items.length}`);
console.log('');

let escritos = 0;
for (const item of items) {
  await cliente.send(new PutCommand({
    TableName: TABLA,
    Item: item,
  }));
  const attr = Object.keys(item.atributos).join(', ');
  console.log(`  OK  producto_id=${String(item.producto_id).padStart(2)}  ${item.familia.padEnd(12)}  [${attr}]`);
  escritos += 1;
}

console.log('');
console.log(`Items escritos: ${escritos}`);

const scan = await cliente.send(new ScanCommand({
  TableName: TABLA,
  Select: 'COUNT',
}));

const total = scan.Count ?? 0;
console.log(`Items en la tabla: ${total}`);

const familias = new Set(items.map((i) => i.familia));
console.log(`Familias distintas: ${familias.size} (${[...familias].join(', ')})`);

if (total === items.length) {
  console.log('VEREDICTO: la tabla contiene exactamente los items esperados.');
} else {
  console.log(`VEREDICTO: se esperaban ${items.length} y hay ${total}. Revisar.`);
  process.exitCode = 1;
}
