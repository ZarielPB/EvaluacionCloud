# Etapa 3: AWS con S3 y Lambda

## Autor
**ZarielPB** - Etapas 1, 3, 5 y 7. La Etapa 2 (persistencia) es de **jeysi702**,
sobre cuyos scripts se apoya esta etapa.

## Fecha
30 de septiembre de 2026

## Estado Previo
- **Etapa 1** (arquitectura) y **Etapa 2** (persistencia) entregadas.
- El entorno local de FLOCI de esta maquina estaba **vacio**: su volumen
  `lomax-floci-data` se creo durante esta sesion y DynamoDB no tenia ninguna
  tabla. La Etapa 2 se ejecuto en el equipo de la otra integrante, asi que antes
  de empezar hubo que **reconstruir la capa de persistencia** con los scripts
  idempotentes de la Etapa 2.
- Nada de S3 ni Lambda existia todavia: ni buckets, ni funcion, ni codigo.
- Entorno verificado: Linux Arch/CachyOS + Hyprland, shell `fish`, Python 3.14.7
  en el host, Node v26.3.1, pnpm 11.22.0, AWS CLI 2.34.32, Docker 29.8.1.

## Objetivos
- Crear los dos buckets de S3: originales y miniaturas.
- Crear una funcion **AWS Lambda** en Python 3.12 con Pillow que valide la
  imagen, genere una miniatura proporcional de maximo 300 x 300 px y registre
  su clave y estado en DynamoDB.
- **P4**: S3 y Lambda creados y funcionales.
- **E3**: demostrar que la funcion no solo responde bien en el transporte, sino
  que **creo el archivo esperado con las dimensiones correctas**.

## Plan de Implementacion

### 1. Reconstruccion de la persistencia (previa y necesaria)

`docker ps` mostro que no habia ningun servicio corriendo y `aws dynamodb
list-tables` devolvio `{"TableNames": []}`. El volumen `lomax-floci-data` fue
creado por `docker compose up`, lo que confirmo que era un entorno nuevo.

La correccion no fue un parche: se **reprodujo la capa de persistencia desde los
scripts oficiales de la Etapa 2**, sin modificarlos:

    aws dynamodb create-table  ->  productos_atributos (HASH producto_id, Number)
    aws rds create-db-instance ->  lomax-db (postgres:15-alpine)
    psql -f scripts/init-rds.sql
    psql -f scripts/seed-rds.sql
    pnpm --dir scripts run seed:dynamodb

El resultado (22 items en DynamoDB, 20 `PUBLICADO` y 2 `PENDIENTE` en RDS)
demuestra que aquellos scripts son **realmente reproducibles e idempotentes**,
que es un requisito explicito del enunciado de la Etapa 2.

El puerto de datos de RDS **no se hardcodeo**: se extrajo del endpoint con
`aws rds describe-db-instances --query 'DBInstances[0].Endpoint.Port'`, para no
depender de que la instancia caiga en el 7001.

### 2. Diseno de la funcion Lambda

**Contrato de entrada** (invocacion sincrona):

    { "producto_id": <numero>, "bucket": "lomax-originales", "clave": "originales/{id}.png" }

**Claves de salida deterministas.** La miniatura se escribe siempre en
`miniaturas/{producto_id}.jpg`. Es la decision central de la etapa: como la clave
se deriva **solo** del `producto_id`, repetir la invocacion **sobrescribe** el
mismo objeto en lugar de crear uno nuevo. Eso es lo que hace idempotente al
endpoint `POST /productos/{id}/reprocesar` de la Etapa 4.

**Flujo interno** (`lambda_function/lambda_function.py`):

1. Valida que el evento traiga `producto_id` y `clave`.
2. `GetObject` del original. Si no existe, marca `ERROR` con el motivo.
3. Verifica tamano contra `LOMAX_MAX_BYTES` (5 MiB). Si lo excede, `ERROR`.
4. `Image.open` + `verify()`: **valida el contenido real de los bytes**, no la
   extension ni el `Content-Type` declarado. Despues reabre la imagen porque
   `verify()` deja el objeto inutilizable.
5. `thumbnail((300, 300), LANCZOS)`: Pillow solo reduce y conserva la
   proporcion. `min(300/1200, 300/800) = 0.25` y por eso `1200x800 -> 300x200`.
6. Convierte a RGB y guarda como JPEG en memoria.
7. `PutObject` en `lomax-miniaturas` con `ContentType: image/jpeg`.
8. `UpdateItem` en `productos_atributos`: `estado_procesamiento = LISTA`,
   `miniatura_key`, `imagen_original_key`, dimensiones y bytes.

**La Lambda nunca escribe en RDS.** El estado de negocio sigue siendo
responsabilidad de la API: por eso un producto con imagen invalida permanece
`PENDIENTE` en la base relacional aunque su item de DynamoDB quede en `ERROR`.

### 3. Manejo de errores: por que la funcion NO lanza la excepcion

Cuando la imagen es invalida, la funcion captura el error, escribe `ERROR` en
DynamoDB y **devuelve `statusCode: 422` con `ok: false`**, en lugar de
propagar la excepcion.

La razon es semantica: el enunciado exige distinguir "la ejecucion se completo"
de "el procesamiento fallo". Si la funcion devolviera una excepcion, el
transporte de Lambda reportaria `FunctionError` y la API no podria diferenciar
un archivo rechazado (error del usuario, 415) de un servicio caido (502/503).
Con este diseno:

- **`FunctionError` presente** = fallo no esperado (red, bucket caido, bug) ->
  la API responde 502/503.
- **`statusCode: 422` sin `FunctionError`** = la imagen es invalida -> la API
  responde 415/422 y el producto sigue `PENDIENTE`.

En el camino de error el `UpdateItem` hace `REMOVE miniatura_key` y no un
`SET null`: no se deja una referencia colgando a un objeto que no existe.

### 4. Decisiones tecnicas y riesgos anticipados

| Riesgo | Decision tomada |
|---|---|
| **ABI de Pillow**: el host tiene Python 3.14 pero el runtime es `python3.12` | `pip install --platform manylinux2014_x86_64 --python-version 3.12 --abi cp312 --only-binary=:all: --no-deps --target build`. Un `pip install` normal descargaria un `_imaging.cpython-314*.so` que en la Lambda falla con `ModuleNotFoundError` |
| **Dependencias de sistema** (`libjpeg`, `zlib`) | No hacen falta: los wheels manylinux enlazan estaticamente. No se instalo nada con `pacman` |
| **Direccionamiento S3 desde la Lambda**: FLOCI inyecta `AWS_ENDPOINT_URL=http://floci:4566` y boto3 usaria `bucket.floci:4566` | DNS de Docker no tiene comodines. Se fijo `s3={"addressing_style": "path"}` en el `Config` compartido por los clientes S3 y DynamoDB |
| **Timeout por defecto de FLOCI = 3 s** | La funcion se creo con `--timeout 30 --memory-size 512` explicitos |
| **Arranque en frio** | La primera invocacion descarga `public.ecr.aws/lambda/python:3.12` (~600 MB). Se evidencio con `docker ps` durante la invocacion |
| **boto3 no se empaqueta** | El runtime de Python ya lo provee. Anadirlo provocaria conflicto de versiones |
| **Imagen de prueba sin Pillow en el host** | `scripts/crear-imagen-prueba.py` escribe un PNG 1200x800 valido usando solo `zlib` y `struct` de la libreria estandar |

## Comandos Ejecutados y Evidencias

| # | Comando | Proposito | Evidencia |
|---|---|---|---|
| 0 | `set -gx AWS_*` y `docker compose -f scripts/floci/docker-compose.yml up -d` | Levantar FLOCI | `01_floci_env.png` |
| 1 | `aws dynamodb create-table --table-name productos_atributos ...` | Recrear la tabla de atributos | `02_dynamodb_create.png` |
| 2 | `pnpm --dir scripts install` y `pnpm --dir scripts run seed:dynamodb` | Recargar los 22 items | `03_seed_dynamodb.png` |
| 3 | `aws rds create-db-instance --db-instance-identifier lomax-db ...` | Recrear RDS y cargar con `init-rds.sql` y `seed-rds.sql` | `04_rds_recreado.png` |
| 4 | `mkdir -p docs/evidencias/ETAPA_3 lambda_function scripts/fixtures scripts/pruebas` | Estructura de carpetas | `05_estructura.png` |
| 5 | `aws s3api create-bucket --bucket lomax-originales` y `--bucket lomax-miniaturas` | Crear los dos buckets | `06_buckets_s3.png` |
| 6 | `./lambda_function/build-lambda.sh` | Empaquetar la funcion con wheels cp312 | `07_build_lambda.png` |
| 7 | `aws lambda create-function --runtime python3.12 ...` | Desplegar la funcion | `08_lambda_create.png` |
| 8 | `aws s3api put-object ... originales/1.png` y `originales/22.jpg` | Subir la imagen valida y la invalida | `09_subir_originales.png` |
| 9 | `aws lambda invoke --payload '{"producto_id":1,...}'` | **Prueba 1: invocacion exitosa** | `10_invoke_ok.png`, `respuesta-1.json` |
| 10 | `docker ps` durante la invocacion | Evidenciar el contenedor real de la Lambda | `11_lambda_container.png` |
| 11 | `aws s3api list-objects-v2` sobre ambos buckets | **Prueba 2: listar** | `12_listar_buckets.png` |
| 12 | `aws s3api get-object` + `python3 scripts/ver-imagen.py` | **Prueba 3: descargar y comparar dimensiones** | `13_descargar_dimensiones.png` |
| 13 | `aws dynamodb get-item` + `aws s3api head-object` | **Prueba 4: DynamoDB coincide con el objeto** | `14_dynamodb_get_item.png` |
| 14 | Repetir el `invoke` y comparar `KeyCount` | **Prueba 5: idempotencia** | `15_idempotencia.png`, `respuesta-1-reintento.json` |
| 15 | `invoke` con `originales/22.jpg` + `get-item` + `head-object` | **Prueba 6: archivo invalido** | `16_invalido_error.png`, `respuesta-22.json` |
| 16 | `psql -c "SELECT producto_id, codigo, estado ... WHERE producto_id IN (1,21,22)"` | Confirmar que RDS no cambio | `16_invalido_error.png` |

## Archivos Generados

    lambda_function/lambda_function.py    Funcion Lambda (Python 3.12 + Pillow)
    lambda_function/requirements.txt      Pillow fijado a 12.2.0
    lambda_function/build-lambda.sh       Build reproducible del paquete ZIP
    scripts/crear-imagen-prueba.py        Genera el PNG 1200x800 (solo stdlib)
    scripts/ver-imagen.py                 Lee dimensiones de PNG y JPEG (solo stdlib)
    scripts/fixtures/no-es-imagen.jpg     Fixture invalido (texto disfrazado)
    scripts/pruebas/original-1200x800.png Original de prueba
    docs/evidencias/ETAPA_3/original-1200x800.png   Original adjunto
    docs/evidencias/ETAPA_3/miniatura-300x200.jpg   Miniatura adjunta
    docs/evidencias/ETAPA_3/respuesta-1.json               Salida del invoke exitoso
    docs/evidencias/ETAPA_3/respuesta-1-reintento.json    Salida del reintento
    docs/evidencias/ETAPA_3/respuesta-22.json              Salida del invoke invalido
    docs/evidencias/ETAPA_3/*.png                          Capturas de terminal

`lambda_function/lambda_function.zip` (7,9 MB), `lambda_function/build/` y
`lambda_function/venv/` quedan fuera de git por ser artefactos de build.

## Entregables y Verificaciones

### Entregable P4: S3 y Lambda creados y funcionales

- Bucket `lomax-originales` con el prefijo `originales/` (tema 1.1: jerarquia
  logica por prefijos en un almacen plano).
- Bucket `lomax-miniaturas` con el prefijo `miniaturas/`.
- Funcion `lomax-miniatura`, runtime `python3.12`, handler
  `lambda_function.lambda_handler`, 30 s, 512 MB, ejecutandose en un contenedor
  real administrado por FLOCI.
- Variables de entorno de la funcion: `LOMAX_BUCKET_ORIGENALES`,
  `LOMAX_BUCKET_MINIATURAS`, `LOMAX_TABLA_ATRIBUTOS`, `LOMAX_MAX_LADO=300`,
  `LOMAX_MAX_BYTES=5242880`.

### Verificacion E3, punto por punto

**1. Salida de `lambda invoke` y resultado funcional.**
El `invoke` devolvio `StatusCode 200` **sin `FunctionError`**. Y el resultado
funcional no es solo un codigo: el payload confirma que el objeto fue creado.

    {
      "statusCode": 200, "ok": true, "producto_id": 1,
      "estado_procesamiento": "LISTA",
      "origen": { "bucket": "lomax-originales", "clave": "originales/1.png" },
      "miniatura_key": "miniaturas/1.jpg",
      "dimensiones": {
        "original":  { "ancho": 1200, "alto": 800, "bytes": 47888 },
        "miniatura": { "ancho": 300,  "alto": 200, "bytes": 3810  },
        "lado_maximo": 300
      }
    }

**2. Listado de `originales/` y `miniaturas/`.**
`list-objects-v2` sobre ambos buckets mostraria `originales/1.png`,
`originales/22.jpg` y `miniaturas/1.jpg`.

**3. Descarga con `get-object` y comparacion de dimensiones.**
Se descargaron las dos claves y se midieron con un lector propio
(`scripts/ver-imagen.py`, que parsea el bloque `IHDR` del PNG y el marcador
`SOF` del JPEG) y con `file`:

    original-1200x800.png    PNG   1200 x 800
    miniatura-300x200.jpg    JPEG  300 x 200

Relacion correcta: `1200x800` es un 3:2; la escala es
`min(300/1200, 300/800) = 0.25`, y `1200*0.25 = 300`, `800*0.25 = 200`.
**Ambos archivos quedan adjuntos** en `docs/evidencias/ETAPA_3/`.
Verificacion cruzada contra S3: `head-object` devolvio el `Content-Type`
`image/jpeg` correcto.

**4. La referencia de DynamoDB coincide con el objeto descargado.**
`get-item` de `productos_atributos` para `producto_id = 1`:

    producto_id 1 | estado LISTA | miniatura_key "miniaturas/1.jpg"
                 | original_key "originales/1.png" | dimensiones 300 x 200

`miniatura_key` es **exactamente** la clave que se descargo en el paso 3.

**5. Invocacion repetida: misma clave, sin objetos extra.**
Se ejecuto un segundo `invoke` con el mismo evento. Resultado:

| | Antes | Despues |
|---|---|---|
| `KeyCount` en `lomax-miniaturas` | 1 | 1 |
| Clave | `miniaturas/1.jpg` | `miniaturas/1.jpg` |
| Tamano | 3810 B | 3810 B |

Los dos JSON de respuesta son **identicos byte a byte salvo el campo
`procesado_en`**, incluido el tamano de la miniatura: la misma entrada produce
la misma salida en la misma clave. Esto es un reintento idempotente, en el
sentido del tema 7.1.

**6. Archivo invalido: estado ERROR y ausencia de miniatura.**
Se subio `scripts/fixtures/no-es-imagen.jpg` (texto plano) a
`originales/22.jpg` declarando `Content-Type: image/jpeg`, **a proposito**, para
demostrar que la validacion no se apoya en la extension ni en el metadato.
Resultado:

    statusCode 422, ok false, estado_procesamiento "ERROR"
    detalle: "No se genero miniatura: El contenido no es una imagen valida:
              cannot identify image file"

- `get-item` de `producto_id = 22` devuelve `estado_procesamiento: "ERROR"`,
  con `error_motivo`, **y sin atributo `miniatura_key`**.
- `head-object` de `miniaturas/22.jpg` responde **404 / NoSuchKey**.
- El listado de `lomax-miniaturas` sigue con **una sola** clave.

El producto **no se publico y no se perdio**: en RDS el `producto_id = 22`
sigue en `PENDIENTE`, y `POST /productos/{id}/reprocesar` podra completarlo.

## Insumos para la Etapa 4 (Backend API, a cargo de jeysi702)

### Variables de entorno que debe leer la API

    AWS_ENDPOINT_URL=http://localhost:4566
    AWS_DEFAULT_REGION=us-east-1
    LOMAX_LAMBDA_NOMBRE=lomax-miniatura
    LOMAX_BUCKET_ORIGINALES=lomax-originales
    LOMAX_BUCKET_MINIATURAS=lomax-miniaturas
    LOMAX_TABLA_ATRIBUTOS=productos_atributos
    LOMAX_MAX_BYTES=5242880
    RDS_HOST=localhost   RDS_PORT=<el del endpoint>   RDS_DB=lomax

### Invocacion sincrona

```js
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({
  region: process.env.AWS_DEFAULT_REGION ?? 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT_URL,          // solo en FLOCI
});

const respuesta = await lambda.send(new InvokeCommand({
  FunctionName: process.env.LOMAX_LAMBDA_NOMBRE ?? 'lomax-miniatura',
  InvocationType: 'RequestResponse',              // SINCRONA, como pide el TEMI
  Payload: Buffer.from(JSON.stringify({
    producto_id: Number(producto_id),
    bucket: process.env.LOMAX_BUCKET_ORIGINALES,
    clave: `originales/${producto_id}.${extension}`,
  })),
}));```

Como interpretar la respuesta
Lo que observa la API	Significado	Respuesta HTTP de la API
respuesta.FunctionError presente o StatusCode != 200	La funcion no pudo ejecutarse (red, S3 caido, bug)	503, y 502 si es un servicio dependiente
statusCode 200 + ok true + LISTA	Miniatura creada y referenciada	200 en POST /productos/{id}/imagen
statusCode 422 + ok false + ERROR	La imagen no es valida	415 si el formato no es JPEG/PNG, 422 si esta corrupta
statusCode 400 + ok false	Evento mal construido	500 (bug propio)
El campo detalle del payload debe devolverse al cliente: el enunciado pide
"documentar la respuesta que identifica el paso fallido".
Reglas que la API debe respetar
1. Validar antes de invocar. La API recibe el archivo, asi que le toca
comprobar Content-Type y el limite de 5 MiB y devolver 415 / 413 antes de
gastar una invocacion. El limite de la Lambda es una defensa en profundidad.
2. Publicar solo con las tres condiciones de la Etapa 1: atributos completos
en DynamoDB y estado_procesamiento = LISTA y el objeto existe en S3.
Conviene un head-object sobre miniatura_key antes del UPDATE a
PUBLICADO; es exactamente lo que se verifico en la prueba 3.
3. Nunca publicar desde la Lambda. La Lambda no escribe en RDS. El paso
PENDIENTE -> PUBLICADO es de la API.
4. reprocesar es idempotente. Reinvocar con la misma clave reescribe
miniaturas/{id}.jpg; no hay que purgar objetos ni crear otro producto.
Devolver 409 si no existe el original, como pide el enunciado.
5. Las imagenes se sirven por la API, no por URL presignada: el enunciado pide
GET /productos/{id}/imagen devolviendo los bytes con el Content-Type
correcto y 404 si aun no esta disponible.
6. Atributos variables. El item de DynamoDB tiene el mapa atributos con
tipos heterogeneos (pulgadas es Number, conexion es String). El
DynamoDBDocumentClient de @aws-sdk/lib-dynamodb lo devuelve ya
deserializado; usen GetItem, nunca Scan, en el catalogo.
Estado Actual y Recomendaciones
Estado: Etapa 3 completada. Las 6 pruebas de la verificacion E3 pasaron y los
buckets, la funcion y la tabla quedaron en estado funcional y reproducible.
Tablero de tareas (el canonico esta en README.md):
Tarea	Responsable
Arquitectura y diagrama	ZarielPB
Modelo RDS + scripts de carga	jeysi702
Tabla DynamoDB + atributos	jeysi702
S3 + Lambda miniaturas	ZarielPB
API Node.js + endpoints	jeysi702
Frontend dashboard	ZarielPB
ECR build/push	jeysi702
EKS despliegue y escalamiento	ZarielPB
Pendiente para las etapas siguientes:
1. Las 20 fotografias del catalogo siguen sin subir. El enunciado pide 20
productos publicados con una fotografia cada uno. Con esta etapa, POST
/productos/{id}/imagen puede cargar el archivo y la Lambda genera la
miniatura sola; la carga masiva se puede hacer con un script que invoque el
endpoint 20 veces.
2. Producto 21 (LOM-9001) intacto, a proposito. Sigue PENDIENTE y es el
caso ideal para la E7: "completar un registro pendiente sin crear otro
producto".
3. Producto 22 (LOM-9002) quedo en ERROR funcional, tambien a proposito.
Sirve para demostrar en la Etapa 5 que la interfaz informa del error y que el
producto incompleto no aparece en el catalogo.
4. Riesgo para la Etapa 7: los Pods reaches S3, DynamoDB y Lambda a traves
del endpoint http://localhost:4566, que es la IP del host, no un nombre de
servicio de Docker. Habra que verificar conectividad desde un Pod y, si hace
falta, exponer FLOCI en la red del cluister.
