# Etapa 2: Persistencia con RDS y DynamoDB

## Autor
**jeysi702** - Etapa 2 (persistencia). La Etapa 1 (arquitectura) es de
**ZarielPB**, sobre cuyo diseño se apoya este trabajo.

## Fecha
30 de septiembre de 2026

## Estado Previo
- Repositorio clonado con la Etapa 1 entregada: diagrama de arquitectura
  (`docs/arquitectura.mmd`, `docs/evidencias/ETAPA_1/arquitectura.png`) y
  documento de diseño (`docs/ETAPA_1_ARQUITECTURA.md`).
- Ningun recurso de AWS creado todavia. Carpetas `backend/`, `frontend/`,
  `proxy/` y `k8s/` vacias.
- Entorno verificado: Linux Noctalia, shell `fish` 4.9.3, Node v26.10.0,
  pnpm 12.6.0, Docker con FLOCI.

## Objetivos
- Crear la base **RDS (PostgreSQL)** con categorias y productos, con
  restricciones que rechacen datos invalidos.
- Crear la tabla **DynamoDB** para los atributos variables y el estado de
  imagen, con el mismo identificador que RDS.
- Cargar al menos 20 productos publicados en 3 categorias, con dos conjuntos
  distintos de atributos.
- Entregar scripts de creacion y carga **reproducibles e idempotentes**.
- Demostrar que la carga se puede repetir sin duplicar registros y que los
  datos sobreviven a un reinicio sin borrar volumenes.

## Plan de Implementacion

### Modelo relacional en RDS

Se creo la base `lomax` con dos tablas. La integridad la impone el motor de
PostgreSQL, no el codigo de aplicacion, que es lo que permite rechazar
operaciones invalidas sin dejar registros parciales:

| Restriccion | Tipo | Proposito |
|---|---|---|
| `pk_categorias` | PRIMARY KEY | Identidad de la categoria |
| `uq_categorias_nombre` | UNIQUE | No repetir nombre de categoria |
| `pk_productos` | PRIMARY KEY | `producto_id` que se comparte con DynamoDB |
| `uq_productos_codigo` | UNIQUE | Rechaza el codigo de producto duplicado |
| `chk_productos_precio` | CHECK (precio >= 0) | Rechaza precio negativo |
| `chk_productos_estado` | CHECK (estado IN ...) | Solo `PENDIENTE` o `PUBLICADO` |
| `fk_productos_categoria` | FOREIGN KEY | Rechaza categoria inexistente |

Las columnas `NOT NULL` cubren los campos obligatorios del enunciado
(codigo, nombre, descripcion, precio, categoria_id). `estado` tiene valor
por defecto `PENDIENTE` y `fecha_creacion` usa `now()`.

Se agregaron dos indices: `ix_productos_categoria` (consulta por categoria)
e `ix_productos_estado` (el catalogo filtra solo por `PUBLICADO`).

### Secuencias del IDENTITY

El seed inserta los identificadores de forma explicita (1..22), lo que deja
las secuencias sin avanzar. Sin sincronizarlas, el primer `INSERT` posterior
que omita el identificador choca contra la clave primaria. El bloque `DO $$`
final de `seed-rds.sql` las alinea con `MAX(...)` para las dos tablas.

Este bug se detecto y corrigio durante la verificacion: la secuencia de
`categorias` nunca se habia sincronizado. La evidencia
`02b_secuencia_categorias.txt` muestra la prueba: tras el parche, un
`INSERT` sin `categoria_id` explicito obtuve el `4` en vez de colisionar
con el `1` existente.

### Modelo de atributos en DynamoDB

Tabla `productos_atributos` con clave de particion `producto_id` (Number),
`PAY_PER_REQUEST`. Entre RDS y DynamoDB **no hay clave foranea**: son
servicios independientes y la relacion se verifica desde la API, tal como
establece el documento de arquitectura de la Etapa 1.

Cada item guarda `producto_id`, `familia`, el mapa `atributos`,
`imagen_original_key`, `miniatura_key`, `estado_procesamiento` y
`actualizado_en`.

Se usaron **tres conjuntos distintos de atributos**, porque no todos los
productos piden la misma informacion:

| Familia | Atributos | Tipos |
|---|---|---|
| PERIFERICOS | `conexion`, `distribucion` | String, String |
| PANTALLAS | `pulgadas`, `resolucion` | **Number**, String |
| AUDIO | `tipo`, `conectividad` | String, String |

El mapa es heterogeneo a proposito: el proyector (`producto_id` 12) agrega
un campo `tipo` que ningun otro producto tiene, y las pantallas usan
`Number` donde los perifericos usan `String`. Con columnas fijas en el
modelo relacional esto habria exigido agregar columnas y una migracion;
en DynamoDB el mismo esquema admite las tres familias sin modificar nada.

### Idempotencia

Los dos scripts de carga son idempotentes por dos mecanismos distintos:

- **RDS**: `CREATE TABLE IF NOT EXISTS` e `INSERT ... ON CONFLICT DO NOTHING`.
  La segunda ejecucion devuelve `INSERT 0 0` y los totales no cambian.
- **DynamoDB**: `PutItem` sobrescribe el item completo con la misma clave
  de particion. Repetir la carga no crea items adicionales.

Esta propiedad se verifico ejecutando cada carga dos veces.

## Comandos Ejecutados y Evidencias

| # | Comando | Proposito | Evidencia |
|---|---|---|---|
| 1 | `aws dynamodb create-table --table-name productos_atributos ...` | Crear la tabla de atributos | `04_dynamodb_create_table.txt` |
| 2 | `psql -f scripts/init-rds.sql` | Crear esquema con 7 restricciones | `01_estado_final_rds.txt` |
| 3 | `psql -f scripts/seed-rds.sql` | Cargar 3 categorias y 22 productos | `02c_seed_rds_reparado.txt` |
| 4 | `psql -f scripts/test-restricciones-rds.sql` | Probar los 3 rechazos | `03_restricciones_rds.txt` |
| 5 | `pnpm add @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb` | Instalar el SDK | `05_pnpm_dependencias.txt` |
| 6 | `pnpm --dir scripts run seed:dynamodb` | Cargar 22 items con atributos | `06_dynamodb_seed.txt` |
| 7 | `aws dynamodb get-item ...` | Recuperar items por `producto_id` | `07_dynamodb_get_item.txt` |
| 8 | `diff` de IDs entre RDS y DynamoDB | Verificar relacion 1:1 | `08_comparacion_ids.txt` |
| 9 | Repetir el seed | Probar idempotencia de DynamoDB | `09_dynamodb_idempotencia.txt` |
| 10 | `docker restart` sin borrar volumenes | Probar persistencia | `10_antes_persistencia.txt`, `11_despues_persistencia.txt` |
| 11 | `get-item` posterior al reinicio | Confirmar datos intactos | `12_get_item_post_reinicio.txt` |

## Archivos Generados
    scripts/init-rds.sql                 Esquema con las 7 restricciones
    scripts/seed-rds.sql                 Carga idempotente de RDS
    scripts/test-restricciones-rds.sql   Pruebas de rechazo
    scripts/seed-dynamodb.mjs            Carga de atributos con el SDK
    scripts/package.json                 Proyecto pnpm
    scripts/pnpm-lock.yaml               Versiones fijadas del SDK
    docs/evidencias/ETAPA_2/             15 archivos de evidencia

## Entregables y Verificaciones

### Entregable P3: RDS y DynamoDB creados y con datos cargados
- Base `lomax` en RDS con `categorias` (3) y `productos` (22: 20
  `PUBLICADO` y 2 `PENDIENTE` de prueba).
- Tabla `productos_atributos` en DynamoDB con 22 items: 8 `PERIFERICOS`,
  8 `PANTALLAS` y 6 `AUDIO`, con tres conjuntos de atributos distintos.
- Se supera el minimo de 20 productos publicados en 3 categorias.

### Verificacion E2

**Consultas SQL**: columnas y restricciones consultadas sobre
`information_schema` y `pg_constraint`.

**Pruebas de restricciones** (`03_restricciones_rds.txt`):

| Prueba | Resultado | SQLSTATE |
|---|---|---|
| Insercion valida | Aceptada, revertida con `ROLLBACK` | - |
| Codigo duplicado | `uq_productos_codigo` violada | `23505` |
| Precio negativo | `chk_productos_precio` violada | `23514` |
| Categoria inexistente | `fk_productos_categoria` violada | `23503` |

En los tres rechazos el conteo de filas se mantuvo en `22` antes y despues,
lo que demuestra que no quedaron registros parciales. La huella MD5 del
conjunto completo fue identica al inicio y al final.

**Get-item de DynamoDB** (`07_dynamodb_get_item.txt`): se recuperaron
items de las tres familias. El `producto_id` de cada uno coincide con el
producto esperado en RDS.

**Identidad de identificadores** (`08_comparacion_ids.txt`): los 22
`producto_id` de DynamoDB coinciden uno a uno con los de RDS.

**Idempotencia**: la segunda ejecucion de cada script de carga dejo los
totales sin cambios (`3 | 22 | 20`) y `ItemCount` en `22`.

**Persistencia tras reinicio** (`10_antes`, `11_despues`): se reiniciaron
los contenedores de RDS y FLOCI **sin borrar volumenes**. La huella MD5
resulto identica (`89cbbb10659cb11901f991c398ab3a3b`) y los 22 items
siguieron disponibles en DynamoDB.

### Contrastacion con el diagrama de la Etapa 1

Al medir los servicios reales se detectaron diferencias con la tabla de
puertos del documento de arquitectura, ya corregidas:

| Servicio | Diagrama (Etapa 1) | Valor real medido |
|---|---|---|
| RDS | TCP 5432 | Puerto mapeado **7001** |
| DynamoDB | TCP 8000 | **4566** (endpoint de FLOCI) |

El puerto `8000` no responde: la connection se rechaza. Ambos servicios se
atienden por el endpoint unico de FLOCI en `http://localhost:4566`, con
`AWS_ENDPOINT_URL` ya exportado en el entorno.

Nota sobre la version: `aws rds describe-db-instances` reporta
`EngineVersion 16.3`, pero el servidor real es **PostgreSQL 15.19**
(`SHOW server_version`). Se documento la version real.

## Estado Actual y Recomendaciones

**Estado:** Etapa 2 completada. RDS y DynamoDB creados, cargados y
verificados. Las 15 evidencias estan en `docs/evidencias/ETAPA_2/`.

**Insumos para la Etapa 3 (S3 y Lambda, a cargo de ZarielPB):**

1. La tabla `productos_atributos` ya existe con las columnas de imagen
   listas para接收 Updates: `imagen_original_key`, `miniatura_key` y
   `estado_procesamiento`, actualmente en `NULL` y `PENDIENTE`
   respectivamente.
2. La funcion Lambda debe hacer `UpdateItem` sobre esta misma tabla, con
   la misma clave de particion `producto_id`, y setear
   `estado_procesamiento` en `LISTA` o `ERROR`.
3. Conviene usar claves de salida deterministas
   (`miniaturas/{producto_id}.jpg`) para que repetir la invocacion no
   acumule objetos, tal como propone el documento de arquitectura.
4. Los 2 productos `PENDIENTE` (`LOM-9001` y `LOM-9002`) ya tienen item en
   DynamoDB, lo que permite probar la recuperacion de registros
   incompletos en la Etapa 4.

**Riesgo anticipado:** el `package.json` de `scripts/` declara
`devEngines` con `pnpm@12.6.0`. Cualquier otra persona que clone el
repositorio debe usar `pnpm`; otro gestor fallara. Es intencional, para
cumplir la regla del proyecto de usar exclusivamente `pnpm`.
