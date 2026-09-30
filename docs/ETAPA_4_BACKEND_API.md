# Etapa 4 — API de catálogo LOMAX (Backend + Dockerfile)

**Autor:** jeysi702
**Punto del TEMI:** P5 (API y Dockerfile) y E4 (evidencia de verificación)

---

## 1. Qué se implementó

API REST en Node.js + Express que cierra el flujo completo del catálogo:

```
Cliente ──POST /productos──► RDS      (producto PENDIENTE)
                               DynamoDB (atributos)

Cliente ──POST /productos/{id}/imagen──► S3 lomax-originales
                                           │ originales/{id}.ext
                                           ▼
                                        Lambda lomax-miniatura
                                           │ genera miniatura
                                           ▼
                                      DynamoDB (LISTA + miniatura_key)
                                      S3 lomax-miniaturas
                                           │
        API verifica ◄──────────────────────┘
             │
             ▼
        RDS: estado PUBLICA
```

El dato clave del enunciado es que **el alta del producto y la carga de la
imagen son pasos separados**. El producto nace `PENDIENTE` y solo pasa a
`PUBLICADO` cuando la miniatura está confirmada tanto en DynamoDB como en S3.
Un producto sin imagen nunca aparece en el catálogo.

### Stack tecnológico

| Pieza | Tecnología |
|---|---|
| Runtime | Node.js 26 Alpine |
| Framework | Express 4.21 |
| Paquetes | pnpm 12.6 |
| Relacional | PostgreSQL (FLOCI RDS) — puerto `7001` |
| No relacional | DynamoDB — tabla `productos_atributos` |
| Objetos | S3 — `lomax-originales`, `lomax-miniaturas` |
| Compute | Lambda `lomax-miniatura` (Python 3.12, invocado de forma síncrona) |

---

## 2. Estructura

```
backend/
├── Dockerfile
├── docker-compose.yml
├── package.json
├── pnpm-lock.yaml
├── .dockerignore
├── scripts/
│   ├── pruebas-e4.mjs                 # 24 casos sobre los 7 endpoints
│   └── verificar-almacenamientos.mjs  # contraste directo RDS/DynamoDB/S3
├── docs/evidencias/ETAPA_4/
└── src/
    ├── config.js        # variables de entorno con valores por defecto
    ├── db.js            # pool de pg y transacciones
    ├── aws.js           # clientes S3/DynamoDB/Lambda + invocación
    ├── errors.js        # traducción de errores a códigos HTTP
    ├── middleware.js    # validación y manejador central de errores
    ├── server.js        # composición de la aplicación
    └── routes/
        ├── categorias.js
        ├── productos.js
        └── imagen.js
```

---

## 3. Endpoints

| Método | Ruta | Resultado |
|---|---|---|
| `GET` | `/categorias` | Categorías de RDS |
| `POST` | `/productos` | `201` con el producto en `PENDIENTE` |
| `POST` | `/productos/{id}/imagen` | Sube la imagen y publica: `200` |
| `POST` | `/productos/{id}/reprocesar` | Reintenta la miniatura: `200` |
| `GET` | `/productos` | Solo publicados, con atributos y miniatura |
| `GET` | `/productos/{id}` | Detalle y estado, incluso si está pendiente |
| `GET` | `/productos/{id}/imagen` | Bytes de la miniatura |
| `GET` | `/salud` | Estado de RDS, S3, DynamoDB y Lambda |
| `GET` | `/` | Índice de endpoints |

### `POST /productos`

Recibe `codigo`, `nombre`, `descripcion`, `precio`, `categoria_id` y
`atributos` (objeto libre por familia de producto). Devuelve `201` y el
`producto_id`.

El registro se inserta en RDS dentro de una transacción y los atributos se
guardan en DynamoDB. Si DynamoDB falla, se revierte el registro de RDS y se
responde `503`: es preferible no tener producto a tener un producto sin
atributos que no podrá publicarse.

### `POST /productos/{id}/imagen`

1. Valida tamaño y tipo declarado.
2. Sube el archivo a `lomax-originales/originales/{id}.ext`.
3. Invoca la Lambda de forma síncrona.
4. Lee DynamoDB y exige `estado_procesamiento = LISTA` **y** `miniatura_key`.
5. Solo entonces actualiza RDS a `PUBLICADO` y responde `200`.

Si la Lambda rechaza la imagen, el producto **permanece en `PENDIENTE`** y el
motivo queda registrado en `error_motivo` dentro de DynamoDB, que es lo que
permite reintentar después.

### `POST /productos/{id}/reprocesar`

Reinvoca la Lambda sobre el original ya guardado. Si el producto nunca tuvo
una imagen, responde `409`. Como la clave de la miniatura se deriva solo del
`producto_id` (`miniaturas/{id}.jpg`), repetir la operación **no duplica
objetos**: la miniatura se sobrescribe.

### `GET /productos`

Filtra `WHERE estado = 'PUBLISHED'` en RDS y completa con `BatchGet` de
DynamoDB, de modo que cada elemento trae datos relacionales, atributos
variables y la referencia de la miniatura.

### `GET /productos/{id}/imagen`

Devuelve los bytes de la miniatura con el `Content-Type` correcto, tomados del
objeto real en S3. Responde `404` si el producto no tiene miniatura.

---

## 4. Manejo de errores

Todas las respuestas de error tienen la misma forma, e identifican **el paso
que falló**, que es lo que pide el enunciado:

```json
{
  "error": {
    "mensaje": "El archivo enviado no es una imagen valida",
    "paso": "lambda",
    "codigo": "imagen_invalida",
    "detalle": { "motivo": "El contenido no es una imagen valida: ..." }
  }
}
```

| Código | Cuándo | Ejemplo de `paso` |
|---|---|---|
| `400` | Datos inválidos o constraint de RDS | `validacion_entrada`, `validacion_rds` |
| `404` | Producto, miniatura o ruta inexistente | `rds`, `s3`, `ruta` |
| `409` | Código duplicado o falta el original | `validacion_rds`, `reproceso` |
| `413` | Archivo mayor a 5 MiB | `validacion_entrada` |
| `415` | MIME no admitido o contenido que no es imagen | `validacion_entrada`, `lambda` |
| `502` / `503` | Servicio dependiente caído | `rds`, `s3_originales`, `dynamodb`, `lambda` |

Dos distinciones que vale la pena destacar:

- **`415` no es `503`.** La Lambda responde `statusCode: 422` cuando la
  imagen es inválida, y eso es un error del usuario. Solo cuando aparece
  `FunctionError` se considera una caída del servicio (`502`).
- **El error no se atribuye por la ruta.** Cada llamada a AWS se envuelve en el
  punto donde ocurre, con su nombre de paso. Adivinar el servicio a partir de
  `/productos` reportaría falsamente "fallo de base de datos" cuando lo que
  cayó fue DynamoDB.

---

## 5. Levantar la API

```bash
cd backend
docker compose up -d --build
docker logs -f lomax-api
```

La API escucha en `http://localhost:3000` y usa `network_mode: host` para
alcanzar directamente el RDS (`localhost:7001`) y FLOCI (`localhost:4566`) del
host.

Variables con valor por defecto (`src/config.js`):

| Variable | Por defecto |
|---|---|
| `PORT` | `3000` |
| `PGHOST` / `PGPORT` | `localhost` / `7001` |
| `PGDATABASE` / `PGUSER` / `PGPASSWORD` | `lomax` / `postgres` / `lomax123` |
| `AWS_ENDPOINT_URL` | `http://localhost:4566` |
| `LOMAX_BUCKET_ORIGENALES` / `LOMAX_BUCKET_MINIATURAS` | `lomax-originales` / `lomax-miniaturas` |
| `LOMAX_TABLA_ATRIBUTOS` | `productos_atributos` |
| `LOMAX_FUNCION_MINIATURA` | `lomax-miniatura` |
| `LOMAX_MAX_BYTES` | `5242880` (5 MiB) |

---

## 6. Verificación (E4)

```bash
cd backend

# 1. Los 4 servicios
curl -s http://localhost:3000/salud | jq

# 2. Los 7 endpoints y los códigos de error
node scripts/pruebas-e4.mjs

# 3. Contraste directo de RDS, DynamoDB y S3
node scripts/verificar-almacenamientos.mjs
```

`pruebas-e4.mjs` crea sus propios datos y devuelve código de salida `1` si
algún caso falla, así que sirve como verificación automática.

### Evidencias guardadas

| Archivo | Contenido |
|---|---|
| `01_salud_servicios.txt` | RDS, S3, DynamoDB y Lambda en `ok` |
| `02_get_categorias.txt` | `GET /categorias` |
| `03_verificacion_almacenamientos.txt` | Estado directo de los tres almacenes y contraste de coherencia |
| `04_pruebas_endpoints.txt` | 24 casos, todos en `OK` |
| `05_comparacion_bytes_imagen.txt` | Bytes del endpoint frente a descarga directa de S3 |
| `06_servicios_caidos_502_503.txt` | Fallos de RDS y de AWS, con el estado `PENDIENTE` conservado |
| `07_contenedor.txt` | Imagen, usuario efectivo y archivos de la imagen |

### Resultado de la comparación de bytes

El endpoint `GET /productos/30/imagen` y la descarga directa de
`s3://lomax-miniaturas/miniaturas/30.jpg` producen archivos con el mismo
SHA-256 (`7632a726…c8c91c`), `cmp` no reporta diferencias, y la imagen es un
JPEG de `300x200` en modo RGB.

---

## 7. Aclaración sobre el tamaño de la miniatura

El enunciado pide una miniatura de **hasta 300x300**. La Lambda usa
`thumbnail((300, 300))` de Pillow, que encaja la imagen dentro de ese cuadro
**conservando la proporción**. Por eso una imagen de `1200x800` produce
`300x200` y no `300x300`: estirarla hasta cuadrado deformaría el producto.

El lado más largo nunca supera los 300 px, que es lo que exige el requisito.

---

## 8. Nota sobre los datos de la Etapa 2

La verificación de coherencia detectó que 19 productos del seed de la Etapa 2
(`LOM-0001` … `LOM-0020`) están marcados `PUBLICA` en RDS sin tener miniatura
en S3. Eso viene del seed, que los creó directamente en ese estado.

**La API de la Etapa 4 nunca produce esa situación**: verifica la miniatura
antes de publicar. El script de verificación distingue ambos casos y reporta
`0` incoherencias entre los productos que pasaron por el flujo de imagen
(`1`, `23`, `27`, `30`).