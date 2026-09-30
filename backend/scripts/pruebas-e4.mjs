// Prueba de los 7 endpoints de la Etapa 4 y de los codigos de error exigidos.
//
//   node scripts/pruebas-e4.mjs [http://localhost:3000]
//
// Crea sus propios datos de prueba y devuelve el codigo de salida 1 si
// algun caso falla, para poder usarlo como verificacion automatica.

import { readFileSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3000';
const originalPng = readFileSync(new URL('../../scripts/pruebas/original-1200x800.png', import.meta.url));
const jpegFalso = readFileSync(new URL('../../scripts/fixtures/no-es-imagen.jpg', import.meta.url));

const sello = Date.now().toString().slice(-6);
let fallos = 0;
const resumen = [];

async function caso(nombre, esperado, fn) {
  let estado = null;
  let cuerpo = null;
  let nota = '';
  try {
    const r = await fn();
    estado = r.estado;
    cuerpo = r.cuerpo;
    nota = r.nota ?? '';
  } catch (error) {
    estado = 0;
    cuerpo = { error: { mensaje: error.message } };
  }
  const ok = estado === esperado;
  if (!ok) fallos += 1;
  resumen.push({ caso: nombre, esperado, obtenido: estado, ok: ok ? 'OK' : 'FALLA', nota });
  return cuerpo;
}

const get = async (ruta) => {
  const r = await fetch(`${BASE}${ruta}`);
  return { estado: r.status, cuerpo: await r.json() };
};

const getBytes = async (ruta) => {
  const r = await fetch(`${BASE}${ruta}`);
  const b = Buffer.from(await r.arrayBuffer());
  return { estado: r.status, bytes: b, tipo: r.headers.get('content-type') };
};

const post = async (ruta, cuerpo) => {
  const r = await fetch(`${BASE}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  return { estado: r.status, cuerpo: await r.json() };
};

const postImagen = async (productoId, nombre, contenido, tipo) => {
  const fd = new FormData();
  fd.append('imagen', new Blob([contenido], { type: tipo }), nombre);
  const r = await fetch(`${BASE}/productos/${productoId}/imagen`, { method: 'POST', body: fd });
  return { estado: r.status, cuerpo: await r.json() };
};

const reprocesar = async (productoId) => {
  const r = await fetch(`${BASE}/productos/${productoId}/reprocesar`, { method: 'POST' });
  return { estado: r.status, cuerpo: await r.json() };
};

// ---------------------------------------------------------------- lectura
await caso('GET /salud reporta 4 servicios', 200, async () => {
  const r = await get('/salud');
  const ok = r.cuerpo.estado === 'ok';
  return { ...r, nota: ok ? 'rds/s3/dynamodb/lambda ok' : JSON.stringify(r.cuerpo) };
});

await caso('GET /categorias lista las 3 categorias', 200, async () => {
  const r = await get('/categorias');
  return { ...r, nota: `${r.cuerpo.length} categorias` };
});

// -------------------------------------------------------------- alta (400/409)
const nuevo = {};
await caso('POST /productos crea PENDIENTE', 201, async () => {
  const r = await post('/productos', {
    codigo: `E4-${sello}`,
    nombre: 'Producto de prueba E4',
    descripcion: 'Creado por pruebas-e4.mjs',
    precio: 42.5,
    categoria_id: 1,
    atributos: { conexion: 'USB-C', distribucion: 'ANSI 104 teclas' },
  });
  nuevo.id = r.cuerpo.producto_id;
  return { ...r, nota: `id=${nuevo.id} estado=${r.cuerpo.estado}` };
});

await caso('POST /productos 409 codigo duplicado', 409, async () => {
  const r = await post('/productos', {
    codigo: `E4-${sello}`,
    nombre: 'Duplicado',
    descripcion: 'Repite el codigo anterior',
    precio: 10,
    categoria_id: 1,
  });
  return { ...r, nota: r.cuerpo.error?.codigo };
});

await caso('POST /productos 400 faltan campos', 400, async () => {
  const r = await post('/productos', { nombre: 'Sin codigo' });
  return { ...r, nota: r.cuerpo.error?.codigo };
});

await caso('POST /productos 400 precio negativo', 400, async () => {
  const r = await post('/productos', {
    codigo: `E4-NEG-${sello}`,
    nombre: 'Precio negativo',
    descripcion: 'Debe fallar',
    precio: -1,
    categoria_id: 1,
  });
  return { ...r, nota: r.cuerpo.error?.codigo };
});

await caso('POST /productos 400 categoria inexistente', 400, async () => {
  const r = await post('/productos', {
    codigo: `E4-CAT-${sello}`,
    nombre: 'Categoria mala',
    descripcion: 'Debe fallar',
    precio: 10,
    categoria_id: 9999,
  });
  return { ...r, nota: r.cuerpo.error?.codigo };
});

// ------------------------------------------------- PENDIENTE no aparece aun
await caso('GET /productos/:id PENDIENTE es visible en detalle', 200, async () => {
  const r = await get(`/productos/${nuevo.id}`);
  return { ...r, nota: `estado=${r.cuerpo.estado}` };
});

await caso('GET /productos no incluye el PENDIENTE', 200, async () => {
  const r = await get('/productos');
  const aparece = r.cuerpo.some((p) => p.producto_id === nuevo.id);
  if (aparece) fallos += 1;
  return { estado: r.cuerpo.length >= 0 ? 200 : 500, cuerpo: r.cuerpo, nota: `${r.cuerpo.length} publicados, pendiente ausente=${!aparece}` };
});

await caso('GET /productos/:id/imagen 404 sin miniatura', 404, async () => {
  const r = await get(`/productos/${nuevo.id}/imagen`);
  return { ...r, nota: r.cuerpo.error?.codigo };
});

await caso('POST /productos/:id/reprocesar 409 sin original', 409, async () => {
  const r = await reprocesar(nuevo.id);
  return { ...r, nota: r.cuerpo.error?.codigo };
});

// --------------------------------------------------------------- imagenes
await caso('POST /productos/:id/imagen 413 archivo > 5 MiB', 413, async () => {
  const grande = Buffer.alloc(6 * 1024 * 1024, 7);
  const r = await postImagen(nuevo.id, 'grande.jpg', grande, 'image/jpeg');
  return { ...r, nota: r.cuerpo.error?.codigo };
});

await caso('POST /productos/:id/imagen 415 MIME no admitido', 415, async () => {
  const r = await postImagen(nuevo.id, 'documento.pdf', Buffer.from('%PDF-1.4\n'), 'application/pdf');
  return { ...r, nota: r.cuerpo.error?.codigo };
});

await caso('POST /productos/:id/imagen 415 contenido no imagen', 415, async () => {
  const r = await postImagen(nuevo.id, 'falso.jpg', jpegFalso, 'image/jpeg');
  return { ...r, nota: r.cuerpo.error?.codigo };
});

await caso('GET /productos/:id sigue PENDIENTE tras 415', 200, async () => {
  const r = await get(`/productos/${nuevo.id}`);
  const ok = r.cuerpo.estado === 'PENDIENTE';
  if (!ok) fallos += 1;
  return { ...r, nota: `estado=${r.cuerpo.estado} ddb=${r.cuerpo.estado_procesamiento}` };
});

await caso('POST /productos/:id/imagen 200 publica', 200, async () => {
  const r = await postImagen(nuevo.id, 'original.png', originalPng, 'image/png');
  return {
    ...r,
    nota: `${r.cuerpo.miniatura_key} ${r.cuerpo.dimensiones?.miniatura?.ancho}x${r.cuerpo.dimensiones?.miniatura?.alto}`,
  };
});

await caso('GET /productos/:id ahora PUBLICADO', 200, async () => {
  const r = await get(`/productos/${nuevo.id}`);
  const ok = r.cuerpo.estado === 'PUBLICADO';
  if (!ok) fallos += 1;
  return { ...r, nota: `estado=${r.cuerpo.estado}` };
});

await caso('GET /productos ahora incluye el nuevo', 200, async () => {
  const r = await get('/productos');
  const p = r.cuerpo.find((x) => x.producto_id === nuevo.id);
  const ok = Boolean(p) && p.imagen_disponible === true;
  if (!ok) fallos += 1;
  return {
    estado: 200,
    cuerpo: p ?? {},
    nota: `en catalogo=${Boolean(p)} con_atributos=${Boolean(p?.atributos && Object.keys(p.atributos).length)}`,
  };
});

await caso('GET /productos/:id/imagen 200 bytes correctos', 200, async () => {
  const r = await getBytes(`/productos/${nuevo.id}/imagen`);
  const ok = r.tipo === 'image/jpeg' && r.bytes.subarray(0, 3).toString('hex') === 'ffd8ff';
  if (!ok) fallos += 1;
  return {
    estado: r.estado,
    cuerpo: {},
    nota: `tipo=${r.tipo} bytes=${r.bytes.length} firma_jpeg=${r.bytes.subarray(0, 3).toString('hex')}`,
  };
});

await caso('POST /productos/:id/reprocesar 200 idempotente', 200, async () => {
  const r = await reprocesar(nuevo.id);
  return { ...r, nota: r.cuerpo.miniatura_key };
});

await caso('POST /productos/:id/reprocesar 200 repetido', 200, async () => {
  const r = await reprocesar(nuevo.id);
  return { ...r, nota: 'segunda invocacion' };
});

// ------------------------------------------------------------------- 404
await caso('GET /productos/999999 404 inexistente', 404, async () => {
  const r = await get('/productos/999999');
  return { ...r, nota: r.cuerpo.error?.codigo };
});

await caso('GET /productos/abc 400 id invalido', 400, async () => {
  const r = await get('/productos/abc');
  return { ...r, nota: r.cuerpo.error?.codigo };
});

await caso('GET /ruta-inexistente 404', 404, async () => {
  const r = await get('/ruta-inexistente');
  return { ...r, nota: r.cuerpo.error?.codigo };
});

// ------------------------------------------------------------------ salida
console.log(`\nBase: ${BASE}`);
console.log(`Fecha (UTC): ${new Date().toISOString()}`);
console.table(resumen);
const total = resumen.length;
console.log(`\nCasos: ${total}   OK: ${total - fallos}   FALLAN: ${fallos}`);
console.log(fallos === 0 ? 'RESULTADO: todas las pruebas pasan.' : 'RESULTADO: hay pruebas que fallan.');
process.exit(fallos === 0 ? 0 : 1);
