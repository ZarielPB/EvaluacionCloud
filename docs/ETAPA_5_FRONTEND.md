# Etapa 5 — Frontend del catálogo LOMAX

**Autor:** ZarielPB
**Punto del TEMI:** P6 (Frontend) y E5 (evidencia de verificación)

---

## 1. Qué se implementó

Aplicación web en React + TypeScript que consume la API de la Etapa 4 y cierra
el flujo completo del enunciado: registrar un producto una sola vez, mostrarlo
en un catálogo común y consultar su detalle.

| Vista | Ruta | Qué hace |
|---|---|---|
| Home | `/` | Estado de los cuatro servicios y accesos a las otras vistas |
| Catálogo | `/catalogo` | Grid de los productos `PUBLICADO` con filtro por categoría y búsqueda |
| Registro | `/registrar` | Formulario de alta en dos pasos (producto, luego imagen) |
| Detalle | `/productos/:id` | Ficha del producto con atributos, estado de imagen y miniatura |
| No encontrado | `*` | Ruta inexistente |

### Stack tecnológico

| Pieza | Tecnología |
|---|---|
| Framework | React 19.3 |
| Lenguaje | TypeScript 6 (modo `strict`) |
| Build | Vite 8.3 |
| Estilos | Tailwind CSS 3.4 (paleta pastel propia) |
| Enrutado | React Router 6.30 (`BrowserRouter`) |
| Cliente HTTP | Axios |
| Iconos | lucide-react (sin emojis) |
| Paquetes | pnpm |
| Lint | oxlint |

---

## 2. Estructura

```
frontend/
├── Dockerfile                 # multi-etapa: Node compila, Nginx sirve
├── nginx.conf                 # SPA con fallback de rutas
├── vite.config.ts             # puerto 5180 y proxy /api en desarrollo
├── tailwind.config.js         # paleta pastel y sombras suaves
├── .oxlintrc.json
└── src/
    ├── main.tsx               # BrowserRouter + ProveedorToast
    ├── App.tsx                # rutas
    ├── types/index.ts         # contrato de la API de la Etapa 4
    ├── services/
    │   ├── api.ts             # Axios, ErrorApi, progreso de carga
    │   └── errores.ts         # mensaje legible para cualquier error
    ├── utils/
    │   ├── validacion.ts      # reglas del formulario (sin React)
    │   ├── formato.ts         # precio, fecha, bytes, atributos
    │   └── color.ts           # color del badge por categoría
    ├── data/atributos.ts      # esquema de atributos por familia
    ├── components/            # UI reutilizable
    └── pages/                 # Home, Catalogo, RegistrarProducto, DetalleProducto
```

---

## 3. Las dos decisiones de diseño que importan

### 3.1 El registro son dos pasos, no uno

El enunciado exige que el producto **solo** pase a `PUBLICADO` cuando la
miniatura esté confirmada. Por eso el formulario no intenta hacerlo todo de una
vez: primero crea el producto (que nace `PENDIENTE`) y después sube la imagen.

```
Usuario               Frontend              API            RDS        DynamoDB/S3
   │  POST /productos      ──►                ──►        PENDIENTE
   │                        ◄── 201 + id ───            atributos
   │  (sin archivo)        ── pantalla PENDIENTE, con botón para subirla después
   │
   │  POST /imagen         ──►                ──►                  ──► Lambda
   │                        ◄── 200 + miniatura ───                LISTA
   │                        ── pantalla PUBLICADO
```

Si la carga de la imagen falla, **el producto no se pierde**: la vista de error
ofrece reintentar solo ese paso, y `POST /reprocesar` reutiliza el original que
ya está en S3.

### 3.2 El navegador nunca habla con S3

Las miniaturas se piden a `GET /productos/{id}/imagen`, no a una URL del bucket.
Así el bucket no necesita ser público y el frontend no depende de las claves de
la Etapa 3.

---

## 4. Validación y manejo de errores

`src/utils/validacion.ts` concentra las reglas, replicando el contrato real de
la API:

| Campo | Regla | Origen |
|---|---|---|
| `codigo` | obligatorio, único, `/^[A-Za-z0-9._-]+$/`, máx. **20** | `productos.codigo VARCHAR(20)` |
| `nombre` | obligatorio, máx. **120** | `productos.nombre VARCHAR(120)` |
| `descripcion` | **obligatoria** | la API responde 400 `campos_obligatorios` |
| `precio` | obligatorio, número, ≥ `0.01` | `CHECK (precio >= 0)` |
| atributos | obligatorios según la familia elegida | esquema en `data/atributos.ts` |
| imagen | opcional, JPEG o PNG, ≤ 5 MiB | `LOMAX_MAX_BYTES` |

> **El enunciado pide la descripción como opcional, pero la API la exige.**
> Se validó contra la API real y el frontend la trata como obligatoria para no
> gastarse un intento con un 400 previsible.

Los errores se clasifican por código HTTP y se muestra siempre `mensaje`,
`paso` y `codigo`, que es lo que el TEMI pide documentar:

| Código | Qué se muestra |
|---|---|
| 400 | campos marcados en rojo + cantidad de pendientes |
| 409 | «ese código ya existe» sobre el campo `código` |
| 413 | «la imagen excede 5 MB» |
| 415 | «solo JPEG o PNG» |
| 502 / 503 | aviso de servicio caído, con aviso de que no se perdió nada |

Los campos se validan en tiempo real pero **un campo vacío solo se marca rojo
después del primer intento**, para no castigar al usuario mientras escribe.

---

## 5. Levantar el frontend

### Desarrollo

```bash
# 1. Dependencias de los datos
docker compose -f scripts/floci/docker-compose.yml up -d
docker compose --project-directory backend up -d --build

# 2. Frontend
cd frontend && pnpm install && pnpm dev
```

Queda en `http://localhost:5180`. Vite hace proxy de `/api` hacia
`http://localhost:3000` replicando el `proxy_pass` de Nginx.

> El puerto **5180** es deliberado. El 5173 es el que usa Vite por defecto y lo
> ocupan otros proyectos de la máquina; además, si dos aplicaciones comparten
> origen, el *service worker* de una intercepta la navegación de la otra y se
> ven páginas del proyecto vecino.

### Producción (punto único de entrada)

```bash
docker compose -f scripts/floci/docker-compose.yml up -d
docker compose up -d --build
```

| Puerto | Servicio | Quién lo usa |
|---|---|---|
| `8080` | proxy Nginx | el usuario (único puerto publicado) |
| `8081` | frontend (Nginx) | el proxy, por loopback |
| `3000` | API | el proxy, por loopback |

Nginx enruta por ruta: `/` al frontend y `/api/*` a la API. La barra final de
`proxy_pass` es lo que descarta el prefijo `/api`, igual que hace el `rewrite`
del proxy de Vite.

---

## 6. Verificación (E5)

```bash
# Lint y build
cd frontend && pnpm lint && pnpm build

# Las cuatro rutas responden por el punto único
for r in / /catalogo /registrar /productos/1; do
  printf "%-16s -> " "$r"; curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:8080$r"
done

# La API responde a través del proxy, sin el prefijo /api
curl -s http://localhost:8080/api/salud | jq .estado
curl -s http://localhost:8080/api/productos/25 | jq .

# El flujo completo por el punto único
ID=$(curl -s -X POST http://localhost:8080/api/productos \
  -H 'Content-Type: application/json' \
  -d '{"codigo":"LOM-E5","nombre":"Prueba E5","descripcion":"Alta completa","precio":10,"categoria_id":1,"atributos":{"conexion":"USB-C"}}' \
  | jq -r .producto_id)

curl -s -X POST http://localhost:8080/api/productos/$ID/imagen \
  -F "imagen=@/ruta/a/imagen.png;type=image/png" | jq .
```

### Matriz de errores comprobada

| Prueba | Resultado |
|---|---|
| Sin `descripcion` | `400 campos_obligatorios` |
| Código repetido | `409 uq_productos_codigo` |
| `codigo` de 21+ caracteres | `400 valor_demasiado_largo` |
| GIF | `415 tipo_no_admitido` |
| Archivo > 5 MiB | `413 archivo_demasiado_grande` |
| PNG válido | `200` → `PUBLICADO` + miniatura |
| `id` inexistente | `404 producto_no_encontrado` |
| Servicio caído | `503` con el `paso` que falló |

### Pruebas de la lógica de validación

Las reglas de `validacion.ts` no dependen de React, así que se ejercitan
directamente sobre el módulo compilado (35 casos: formato de código, límites de
longitud, precio, esquemas por familia, validación de imagen y construcción del
cuerpo que se envía a la API).

---

## 7. Bugs encontrados y corregidos durante la verificación

Estos no se veían a ver leyendo el código; aparecieron al ejecutar el
flujo completo.

1. **Los atributos nunca se enviaban a DynamoDB.**
   `validarTodo` pasaba el *ID* de categoría (`"1"`) a `esquemaDe`, que está
   indexado por *nombre* (`PERIFERICOS`), y por eso recibía un esquema vacío:
   los atributos no se validaban ni aparecían en el cuerpo del `POST`. Ahora
   recibe el esquema ya resuelto.

2. **El reintento perdía el producto ya creado.**
   La vista de resultado solo se pintaba en `publicado | pendiente | error`, así
   que al reintentar (fase `subiendo`) saltaba al formulario vacío.

3. **`codigo` aceptaba 50 caracteres contra un `VARCHAR(20)`.**
   El desborde daba SQLSTATE `22001`, que no estaba en el mapa de errores de la
   API y terminaba en un `500` que parecía un bug del servidor. Corregido en los
   dos lados: validación en la API y límite correcto en el formulario.

4. **`familia` se guardaba siempre en `null`.**
   El backend indexaba el mapa de familias con `undefined`, que siempre daba
   `undefined`. Ahora se deriva del nombre real de la categoría en RDS.

5. **La confirmación de publicación mostraba `undefinedxundefined`.**
   El tipo de `dimensiones` decía `{ancho, alto}` cuando la Lambda devuelve
   `{original, miniatura, lado_maximo}`.

---

## 8. Desviación de la arquitectura documentada en la Etapa 1

La Etapa 1 describe dos redes bridge (`lomax-edge` y `lomax-data`) con
resolución de nombres por servicio. **No se pudo aplicar tal cual** en esta
máquina: el proxy, en un bridge, no alcanza a la API porque `ufw` bloquea el
tráfico de un contenedor hacia el host (y la API necesita `network_mode: host`
desde la Etapa 4 para llegar al RDS de FLOCI en `localhost:7001`).

La solución aplicada es que **los tres servicios usan `network_mode: host`** y
se hablan por loopback:

- Se conserva el requisito de fondo de la Etapa 1: **Nginx es el punto único de
  entrada y enruta por ruta** (`/` al frontend, `/api/*` a la API).
- Se conserva que el único puerto publicado sea el `8080`.
- Se evita depender de una regla de firewall que no está abierta en la máquina.

Si más adelante se abre la regla equivalente en `ufw`, se puede volver a la
topología de la Etapa 1 sustituyendo `127.0.0.1:8081` por `frontend:80` y
`127.0.0.1:3000` por `api:3000` en `proxy/nginx.conf`.

---

## 9. Nota sobre los datos de la Etapa 2

De los productos que dejó la semilla inicial, **19 de 20 no tienen miniatura**:
el seed de la Etapa 2 los registró en RDS y DynamoDB sin pasar por S3. No es un
problema del frontend — la API responde `imagen_disponible: false` y las
tarjetas muestran el icono de respaldo.

También quedaron productos de prueba creados durante la verificación de esta
etapa (los que empiezan por `LOM-TST-`, `LOM-FIN-`, `LOM-PROXY-`, `LOM-E5-` y
los de longitud). La API de la Etapa 4 **no expone `DELETE`**, así que no se
pueden borrar desde la aplicación: hay que hacerlo con `DELETE FROM productos`
en RDS y el `delete-item` de DynamoDB.

---

## 10. Qué falta

- **Etapa 6** — publicar las imágenes del frontend y de la API en ECR.
- **Etapa 7** — manifiestos de EKS y validación del escalamiento.
- El *dashboard* con métricas agregadas sigue siendo una vista pendiente dentro
  del frontend; esta entrega cierra las cuatro vistas del enunciado.
---

## 11. Evidencias

Las capturas y las salidas de verificación están en
[`evidencias/ETAPA_5/`](evidencias/ETAPA_5/): las nueve pantallas de la
aplicación, las respuestas reales del API en los tres estados del producto, los
códigos de error comprobados, las 35 pruebas de validación, el estado de los
contenedores con los binds reales y el access log del proxy.
