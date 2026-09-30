# LOMAX SA — Plataforma de Registro y Consulta de Productos

Proyecto de **Tecnologías Emergentes I**. Solución en la nube para registrar cada
producto una sola vez (código, nombre, precio, categoría, atributos variables y
fotografía), mostrar un catálogo común y consultar el detalle, reemplazando las
hojas de cálculo y las carpetas de imágenes dispersas.

## Arquitectura

- **Entorno:** FLOCI (emulación local de AWS vía Docker Compose, `http://localhost:4566`).
- **Entrada única:** Nginx reverse proxy como punto único para usuarios.
- **Datos:** RDS (PostgreSQL) para categorías y productos; DynamoDB para atributos
  variables y estado de imagen; S3 con dos buckets (originales y miniaturas).
- **Procesamiento:** AWS Lambda síncrona genera miniaturas de hasta 300x300 px.
- **Despliegue:** ECR para las imágenes Docker propias y EKS para escalamiento
  y autorrecuperación.

## Documentación por etapa

| Etapa | Documento | Evidencias |
|---|---|---|
| 1 — Diseño de la arquitectura | [`docs/ETAPA_1_ARQUITECTURA.md`](docs/ETAPA_1_ARQUITECTURA.md) | [`evidencias/ETAPA_1/`](docs/evidencias/ETAPA_1/) |
| 2 — Persistencia RDS y DynamoDB | [`docs/ETAPA_2_PERSISTENCIA.md`](docs/ETAPA_2_PERSISTENCIA.md) | [`evidencias/ETAPA_2/`](docs/evidencias/ETAPA_2/) |
| 3 — AWS con S3 y Lambda | [`docs/ETAPA_3_S3_LAMBDA.md`](docs/ETAPA_3_S3_LAMBDA.md) | [`evidencias/ETAPA_3/`](docs/evidencias/ETAPA_3/) |

- Diagrama de arquitectura: [`docs/arquitectura.drawio`](docs/arquitectura.drawio) ·
  fuente textual [`docs/arquitectura.mmd`](docs/arquitectura.mmd) ·
  PNG [`arquitectura.png`](docs/evidencias/ETAPA_1/arquitectura.png)

## Estructura

    frontend/          Aplicación web (formulario, catálogo, detalle)
    backend/           API Node.js 22 (pnpm) + Dockerfile
    proxy/             Configuración de Nginx (reverse proxy)
    k8s/               Manifiestos de EKS (Deployments, Services, Secrets)
    lambda_function/   Función AWS Lambda de miniaturas (Python 3.12 + Pillow)
    scripts/           Scripts reproducibles de creación, carga y verificación
    scripts/floci/     docker-compose de FLOCI
    docs/              Documentación, diagramas y evidencias por etapa

## Reglas del proyecto

- Gestor de paquetes **exclusivamente `pnpm`** en todo el ecosistema Node.js.
- Python solo donde se requiera (Lambda), siempre dentro de un `venv`.
- Toda evidencia organizada en `docs/evidencias/ETAPA_<N>/`.
- Los scripts de carga son **idempotentes**: se pueden repetir sin duplicar datos.

## Integrantes y Asignación de Etapas

| Integrante | GitHub | Etapas Asignadas |
|---|---|---|
| ZarielPB | @ZarielPB | 1 (Arquitectura), 3 (S3/Lambda), 5 (Frontend), 7 (EKS) |
| jeysi702 | @jeysi702 | 2 (Persistencia), 4 (Backend API), 6 (ECR) |

### Tablero de tareas

| Tarea | Responsable | Etapa | Entregable | Estado |
|---|---|---|---|---|
| Arquitectura y diagrama con iconos AWS | ZarielPB | 1 | P2 | Hecho |
| Modelo RDS + scripts de carga | jeysi702 | 2 | P3 | Hecho |
| Tabla DynamoDB + atributos variables | jeysi702 | 2 | P3 | Hecho |
| S3 + Lambda miniaturas 300x300 | ZarielPB | 3 | P4 | Hecho |
| API Node.js + endpoints | jeysi702 | 4 | P5 | Pendiente |
| Frontend dashboard del catálogo | ZarielPB | 5 | P6 | Pendiente |
| Publicación de imágenes en ECR | jeysi702 | 6 | P7 | Pendiente |
| Despliegue y validación en EKS | ZarielPB | 7 | P8 | Pendiente |
| Repositorio con README, scripts y evidencias | Ambos | Todas | P9 | En curso |

## Estado del Proyecto

- [x] Etapa 1 — Diseño de la arquitectura
- [x] Etapa 2 — Persistencia con RDS y DynamoDB
- [x] Etapa 3 — AWS con S3 y Lambda
- [ ] Etapa 4 — Backend con API y endpoints
- [ ] Etapa 5 — Frontend con dashboard del catálogo
- [ ] Etapa 6 — Publicación de imágenes en ECR
- [ ] Etapa 7 — Despliegue y validación en EKS

## Entorno local

    export AWS_ACCESS_KEY_ID=test
    export AWS_SECRET_ACCESS_KEY=test
    export AWS_DEFAULT_REGION=us-east-1
    export AWS_ENDPOINT_URL=http://localhost:4566

Levantar FLOCI: `docker compose -f scripts/floci/docker-compose.yml up -d`

## Enlaces

- **Repositorio:** https://github.com/ZarielPB/EvaluacionCloud
