# Etapa 1: Diseno de la arquitectura

## Autor
**ZarielPB** - Etapas 1 a 3 (arquitectura, persistencia, S3 y Lambda).
La segunda integrante continua desde la Etapa 4 (API, frontend, ECR, EKS).

## Estado Previo
- Directorio vacio con solo dos archivos de referencia del docente:
  `TEMI-Evaluacion-D.txt` e `indicetemas.txt`.
- Sin repositorio git, sin estructura de carpetas y sin ningun recurso desplegado.
- Entorno verificado: Linux Arch/CachyOS + Hyprland, shell `fish`,
  Node v26.3.1, pnpm 11.22.0, Docker 29.8.1, git 2.55.

## Objetivos
- Disenar el registro y la consulta del catalogo con **iconos oficiales de AWS**.
- Senalar expresamente: entorno local **FLOCI**, **frontend**, **proxy**, **API**,
  **redes**, **protocolos**, **puertos**, **almacenamiento** y
  **ubicacion de los componentes en Kubernetes**.

## Plan de Implementacion

Se adopto una arquitectura de **tres tiers con separacion de responsabilidades**
(tema 7.3) sobre un **unico punto de entrada**: Nginx. Toda peticion del usuario
pasa por el proxy, que enruta por ruta `/` hacia el frontend estatico y `/api/*`
hacia la API. La logica de negocio vive unicamente en la API.

El almacenamiento se **separa por tipo de dato**:
- **Amazon RDS (PostgreSQL 15)** para categorias y productos: los datos son de
  esquema fijo, con **clave primaria**, **clave unica** sobre el codigo, y
  restricciones `CHECK`/`NOT NULL`/`FOREIGN KEY` que el motor aplica de forma
  transaccional. Esto permite rechazar precio negativo, codigo duplicado o
  categoria inexistente **sin dejar registros parciales**.
- **Amazon DynamoDB** para los atributos variables y el estado de imagen: cada
  familia de productos tiene atributos distintos (un teclado pide conexion y
  distribucion; una pantalla pide pulgadas y resolucion), por lo que se modela
  un **mapa de atributos** en una tabla NoSQL con **clave de particion
  `producto_id`**, igual al `producto_id` de RDS.

**No hay clave foranea entre RDS y DynamoDB**: son servicios independientes y la
relacion se verifica **desde la API** (tema 7.3).

Las imagenes no van a la base de datos. **Amazon S3** actua como almacen de
objetos con dos buckets separados: `lomax-originales` (prefijo `originales/`) y
`lomax-miniaturas` (prefijo `miniaturas/`), siguiendo la gestion de activos
digitales del tema 1.3. El gran tamano de las fotografias es la causa del
problema de lentitud descrito por la empresa; por eso **AWS Lambda** genera una
miniatura proporcional de maximo **300x300 px** de forma **sincrona**
(`InvocationType=RequestResponse`) y con **clave de salida determinista**
(`miniaturas/{producto_id}.jpg`), de modo que repetir la solicitud nunca crea
objetos duplicados.

El ciclo de vida se implementa como una **transaccion de dos fases simplificada
(Saga, tema 7.1)**: RDS registra primero el producto en `PENDIENTE` y solo pasa a
`PUBLICADO` cuando la API confirma que los atributos estan completos **y** que
DynamoDB reporta `LISTA` **y** que la miniatura existe en S3. Si algo falla, el
producto **permanece en `PENDIENTE`** y se completa con
`POST /productos/{id}/reprocesar`, que es **idempotente**.

El despliegue usa **contenedores (tema 5.1)**: `node:22-alpine` para frontend y
backend, `python:3.12-slim` para la Lambda. Las imagenes se publican en
**Amazon ECR (tema 5.2)** y se ejecutan en **Amazon EKS (tema 5.3)**, donde el
proxy se expone como `Service` tipo `NodePort` y el resto como `ClusterIP`.

### Justificacion de cada servicio (segun indicetemas.txt)

| Servicio | Tema del indice | Justificacion en esta solucion |
|---|---|---|
| Amazon S3 | 1.1, 1.3 | Almacenamiento de objetos binarios con claves planas y jerarquia logica por prefijos. Separa el binario grande del dato transaccional y permite `PutObject`/`GetObject`/`ListObjectsV2` desde la API. |
| Amazon DynamoDB | 3.1 | Modelo NoSQL con clave de particion `producto_id`. Permite atributos variables por familia de producto y guardar la referencia de imagen y su estado sin alterar el esquema. |
| Amazon RDS | 3.3 | Persistencia relacional administrada con PostgreSQL 15. Aporta integridad transaccional: `PRIMARY KEY`, `UNIQUE(codigo)`, `CHECK(precio >= 0)` y `FOREIGN KEY` a categorias. |
| AWS Lambda | 4.1, 4.3 | Computo serverless y efimero para la transformacion de imagenes, exactamente el caso de uso visto en clase. Se empaqueta como ZIP con su runtime y su execution role. |
| Amazon ECR | 5.2 | Registro de imagenes Docker propias con `docker login`, `docker tag` y `docker push` contra la URI de FLOCI. |
| Amazon EKS | 5.3 | Claster con Pods, Deployments y Services. Permite verificar **escalamiento** (1 a 3 replicas de la API) y **autorrecuperacion** (el controlador reemplaza un Pod eliminado). Secrets para inyectar credenciales. |
| Docker | 5.1 | Imagen, contenedor, `Dockerfile`, redes y resolucion de nombres entre contenedores. |
| Nginx (proxy) | 7.2 | Punto unico de entrada y enrutamiento por ruta: `/` al frontend, `/api/*` a la API. |
| FLOCI | 8.1 | Emulacion local de AWS con Docker Compose; expone el endpoint `http://localhost:4566` y levanta contenedores reales de RDS, Lambda, S3, ECR y EKS. |
| AWS SDK v3 | 8.3 | Clientes `@aws-sdk/client-rds-data`, `client-dynamodb`, `client-s3` y `client-lambda`, con manejo de errores y timeouts. |

### Flujo de datos

**1. Registro (crea un PENDIENTE, no un producto publicado)**
1. El navegador envia `POST /api/productos` con codigo, nombre, descripcion,
   precio, `categoria_id` y atributos.
2. El proxy enruta a la API (`:3000`).
3. La API inserta en **RDS** con `estado = 'PENDIENTE'`. Si el codigo ya existe
   responde `409`; si el precio es negativo o la categoria no existe, la
   transaccion se revierte y responde `400` **sin registro parcial**.
4. La API guarda los atributos variables en **DynamoDB** con
   `producto_id` como clave de particion.
5. La API responde `201` con `producto_id` y `PENDIENTE`.

**2. Carga de imagen (completa la publicacion)**
1. `POST /api/productos/{id}/imagen` con el archivo JPEG o PNG.
2. La API valida **Content-Type** y tamano; si excede 5 MB responde `413`, y si
   el formato no es JPEG/PNG responde `415`.
3. `PutObject` en **`lomax-originales`** con clave determinista
   `originales/{producto_id}.{ext}`.
4. La API invoca **Lambda de forma sincrona** con `{producto_id, bucket, clave}`.
5. Lambda hace `GetObject` del original, valida que sea una imagen real,
   genera la miniatura proporcional de maximo 300x300 px con Pillow y hace
   `PutObject` en `lomax-miniaturas` con clave `miniaturas/{producto_id}.jpg`.
6. Lambda hace `UpdateItem` en **DynamoDB**: `estado_procesamiento = 'LISTA'` o
   `'ERROR'`.
7. La API verifica en DynamoDB que el estado es `LISTA` y que existe el objeto
   miniatura; solo entonces hace `UPDATE` en **RDS** a `PUBLICADO` y responde `200`.

**3. Consulta del catalogo y detalle**
1. `GET /api/productos` devuelve **solo publicados**: la API consulta RDS por
   `estado = 'PUBLICADO'` y por cada producto hace `GetItem` en DynamoDB para
   traer atributos y `miniatura_key`.
2. `GET /api/productos/{id}` devuelve el detalle, los atributos y el estado;
   `404` si no existe, lo que permite verificar registros pendientes.
3. `GET /api/productos/{id}/imagen` hace `GetObject` de la miniatura y la
   devuelve con el `Content-Type` correcto; `404` si aun no esta disponible.
4. El navegador **nunca** habla directamente con S3: las imagenes se recuperan a
   traves de la API, de modo que la miniатura no queda expuesta en el bucket
   (`Block Public Access`).

**4. Reprocesamiento (idempotente)**
1. `POST /api/productos/{id}/reprocesar` vuelve a invocar Lambda sobre el
   **original ya guardado**, sin crear un producto nuevo.
2. `409` si no existe original. Como las claves de salida son deterministas, el
   reintento **sobrescribe la misma clave** y no acumula objetos.
3. Si la imagen es invalida, el estado queda en `ERROR` en DynamoDB y el
   producto **no se publica**, pero **tampoco se pierde**: se puede reintentar.

### Estados del ciclo de vida

    RDS.productos.estado                DynamoDB.estado_procesamiento
    ---------------------------         ---------------------------------
    (nuevo) --validacion OK--> PENDIENTE
    PENDIENTE --atributos + miniatura--> PUBLICADO
    PENDIENTE --fallo de imagen--> PENDIENTE   (con estado_procesamiento = ERROR)

- `PENDIENTE`: el producto existe pero **no** aparece en el catalogo.
- `PUBLICADO`: atributos completos y miniatura verificada en S3.
- `ERROR`: solo en DynamoDB; indica que Lambda no pudo generar la miniatura.
  El producto sigue en `PENDIENTE` en RDS y se reintenta con `reprocesar`.

**Consistencia eventual con reintentos idempotentes** (tema 7.1): no hay
transaccion distribuida real entre RDS, DynamoDB y S3; el estado en RDS es el
arbirto y el endpoint de reprocesamiento completa el registro sin duplicarlo.

### Redes, protocolos y puertos

| Origen | Destino | Protocolo | Puerto | Nota |
|---|---|---|---|---|
| Navegador | Nginx proxy | HTTP | host `8080` (NodePort `30080`) | Punto unico de entrada |
| Nginx proxy | Frontend | HTTP | `80` | Ruta `/` |
| Nginx proxy | API | HTTP | `3000` | Ruta `/api/*` |
| API | RDS PostgreSQL | TCP (PostgreSQL wire) | `5432` | URL por variable de entorno |
| API | DynamoDB | HTTP (`application/x-amz-json-1.0`) | `8000` | LocalStack/DynamoDB local |
| API | S3 (`PutObject`, `GetObject`) | HTTP (REST S3) | `4566` | Endpoint de FLOCI |
| API | Lambda | HTTP, invocacion **sincrona** | `4566` | `InvocationType=RequestResponse` |
| Lambda | S3 y DynamoDB | HTTP | `4566` / `8000` | Mismo endpoint de FLOCI |
| Kubelet/API server | EKS | HTTPS (Kube API) | `6443` | `kubectl` |

> **Nota importante y honesta:** el diagrama muestra los **puertos de servicio**
> de cada tecnologia. FLOCI publica sus servicios en endpoints locales que
> pueden diferir; se documentaran los valores exactos (`localhost:<puerto>`)
> **confirmandolos empiricamente en la Etapa 2** y actualizando esta tabla. Es
> exactamente el contraste entre diagrama y recursos desplegado que pide la
> verificacion E1.

**Segmentacion de redes**
- En **Docker Compose (Etapas 4-5)**: dos redes bridge, `lomax-edge` (proxy y
  frontend) y `lomax-data` (proxy, api y datos). La resolucion de nombres entre
  contenedores es del tema 5.1.
- En **EKS (Etapa 7)**: red de Pods con DNS interno de servicio; **solo el proxy
  es `NodePort`** y frontend y api quedan como `ClusterIP`, de modo que no son
  accesibles desde el host. Es el equivalente funcional de la segmentacion.
  `NetworkPolicy` se deja como mejora futura, esta fuera del indice de temas.

### Ubicacion de los componentes en Kubernetes

| Componente | Tipo de recurso K8s | Nombre | Replicas | Servicio |
|---|---|---|---|---|
| Nginx proxy | Deployment | `proxy` | 1 | `Service` **NodePort** `30080 -> 8080` |
| Frontend | Deployment | `frontend` | 2 | `Service` **ClusterIP** `:80` |
| API | Deployment | `api` | 1 (escala a **3**) | `Service` **ClusterIP** `:3000` |
| RDS | **NO** es un Pod | gestionado por FLOCI | - | Variable de entorno / `Secret` |
| DynamoDB | **NO** es un Pod | gestionado por FLOCI | - | Variable de entorno |
| S3 (x2) | **NO** es un Pod | gestionado por FLOCI | - | Variable de entorno |
| Lambda | **NO** es un Pod | gestionado por FLOCI | - | Invocada por la API |
| ECR | **NO** es un Pod | gestionado por FLOCI | - | `imagePullSecrets` |

**Punto clave de la arquitectura:** RDS, DynamoDB, S3 y Lambda **viven fuera del
cluster**, en el host de FLOCI. Por eso **eliminar o recrear Pods nunca pierde
productos**: es la garantia de persistencia que la empresa necesita cuando se
cambia una computadora o falla la aplicacion. El proxy sigue siendo la entrada
de usuarios en las siete etapas, y la API escala de 1 a 3 replicas con el mismo
`Service` de por delante.

## Comandos Ejecutados y Evidencias

| # | Comando | Proposito | Evidencia |
|---|---|---|---|
| 1 | `git init` | Crear el repositorio | ![git init](../evidencias/ETAPA_1/01_git_init.png) |
| 2 | `mkdir -p frontend backend proxy k8s scripts docs/evidencias/ETAPA_1` | Estructura de carpetas | ![estructura](../evidencias/ETAPA_1/02_estructura.png) |
| 3 | `cat > .gitignore << 'EOF'` | Excluir `node_modules`, `venv`, `.env` | ![gitignore](../evidencias/ETAPA_1/02_estructura.png) |
| 4 | `cat > README.md << 'EOF'` | README inicial del proyecto | ![readme](../evidencias/ETAPA_1/02_estructura.png) |
| 5 | `cat > docs/arquitectura.mmd << 'EOF'` | Fuente textual versionada del diagrama | ![mmd](../evidencias/ETAPA_1/03_arquitectura_mmd.png) |
| 6 | `cat > docs/ETAPA_1_ARQUITECTURA.md << 'EOF'` | Documento de arquitectura de la etapa | ![doc](../evidencias/ETAPA_1/04_documento_arquitectura.png) |
| 7 | Diagrama en `app.diagrams.net` con stencil AWS4 + Kubernetes | Iconos oficiales AWS | ![diagrama](../evidencias/ETAPA_1/05_diagrama_arquitectura.png) |
| 8 | `git add -A && git commit -m "[Etapa 1] ..."` | Commit de entrega de la etapa | ![commit](../evidencias/ETAPA_1/06_git_commit.png) |

## Archivos Generados
    .gitignore
    README.md
    docs/ETAPA_1_ARQUITECTURA.md
    docs/arquitectura.mmd
    docs/arquitectura.drawio          (editado en draw.io, guardado en el repo)
    docs/evidencias/ETAPA_1/arquitectura.png
    frontend/.gitkeep, backend/.gitkeep, proxy/.gitkeep,
    k8s/.gitkeep, scripts/.gitkeep

## Entregables y Verificaciones

- **Entregable P2 - diagrama de arquitectura:** `docs/evidencias/ETAPA_1/05_diagrama_arquitectura.png`,
  construido en draw.io con la paleta de **iconos oficiales de AWS** y el stencil
  de Kubernetes, dentro del borde de FLOCI, con redes, protocolos y puertos rotulados.
- **Verificacion E1 - explicar el funcionamiento usando el diagrama:** el guion esta
  en la seccion siguiente y se expone en la defensa.
- **Actividad 1 / Producto 1 (sintesis conceptual):** este documento cubre la
  justificacion de cada servicio contra `indicetemas.txt`; las tablas completas de
  Cloud Computing, Contenedores, Kubernetes y AWS se entregan en la carpeta de
  esta etapa.

### Guion para la verificacion E1 (explicacion oral, ~4 minutos)

> "Este diagrama muestra la arquitectura de LOMAX SA ejecutandose sobre **FLOCI**,
> que es la emulacion local de AWS. Todo lo que esta dentro del borde punteado es
> un contenedor real de Docker, no un dibujo: por eso los servicios se pueden
> crear y borrar con la CLI de AWS.
>
> **El unico punto de entrada es Nginx**, el reverse proxy, en el puerto 8080 de
> mi maquina. El usuario nunca habla con un servicio interno. El proxy mira la
> ruta de la URL: si empieza por `/api` la manda a la API en el puerto 3000, y si
> no, la manda al frontend en el puerto 80. Esa separacion es enrutamiento por
> rutas, no logica metida en el servidor web.
>
> **Los tres componentes que se ejecutan en Kubernetes son el proxy, el frontend y la API. "
>
> (continuar con: separacion de responsabilidades 7.3 -> los datos relacionales
> en RDS y los variables en DynamoDB, con la misma clave `producto_id` y la
> relacion verificada desde la API porque entre servicios no hay clave foranea ->
> las fotos en S3 en dos buckets, porque la original grande no debe ir en la base
> de datos -> Lambda que genera la miniatura de 300x300 de forma sincrona, con
> clave determinista para que reintentar no duplique objetos -> ECR y EKS, donde
> el proxy es el unico Service NodePort y los datos viven FUERA del cluster, que
> es la razon por la que borrar un Pod no pierde productos -> y el ciclo de vida
> PENDIENTE a PUBLICADO, donde un producto incompleto no aparece en el catalogo y
> se completa con `reprocesar` en vez de crear otro producto."

## Estado Actual y Recomendaciones

**Estado:** Etapa 1 completada. No se desplego ningun recurso; el diagrama es el
contrato que las demas etapas deben cumplir.

**Recomendaciones para la Etapa 2 (persistencia):**
1. Crear el modelo relacional con `UNIQUE(codigo)` y `CHECK(precio >= 0)`, y
   verificar que una operacion invalida no deja registros parciales.
2. En DynamoDB, particionar por `producto_id` y usar `GetItem` en el catalogo,
   nunca `Scan`.
3. **Anotar en la tabla de puertos de este documento los valores reales** que
   FLOCI publique para RDS y DynamoDB, y actualizar el diagrama si difieren.
   Ese contraste diagrama vs. realidad es parte de E1.
4. Crear `scripts/` con los scripts de creacion y carga **idempotentes**
   (`CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO NOTHING`) para poder repetirlos
   sin duplicar.

**Tablero de tareas (requerido por el docente):**

| Tarea | Responsable | Etapa | Estado |
|---|---|---|---|
| Arquitectura y diagrama | ZarielPB | 1 | Hecho |
| Modelo RDS + scripts de carga | ZarielPB | 2 | Pendiente |
| Tabla DynamoDB + atributos | ZarielPB | 2 | Pendiente |
| S3 + Lambda miniaturas | ZarielPB | 3 | Pendiente |
| API Node.js + endpoints | (compañera) | 4 | Pendiente |
| Frontend dashboard | (compañera) | 5 | Pendiente |
| ECR build/push | (compañera) | 6 | Pendiente |
| EKS despliegue y escalamiento | (compañera) | 7 | Pendiente |

**Riesgo anticipado para etapas futuras:** la Lambda en Python usara Pillow, que
trae binarios nativos; hay que fijarla en `requirements.txt` y construirla en un
entorno `venv` (`python -m venv venv`). En fish, activar el venv con
`source venv/bin/activate` no es fiable; usar `set -gx PATH venv/bin $PATH` o
`source venv/bin/activate.fish`. En el lado Node.js, evitar dependencias nativas
en las imagenes `node:22-alpine`; si alguna fuera necesaria, compilarlas en la
etapa de build y no en el arranque del contenedor.
