# LOMAX SA — Plataforma de Registro y Consulta de Productos

Proyecto de **Tecnologías Emergentes I**. Solución en la nube para registrar cada
producto una sola vez (código, nombre, precio, categoría, atributos variables y
fotografía), mostrar un catálogo común y consultar el detalle, reemplazando las
hojas de cálculo y las carpetas de imágenes dispersas.

## Arquitectura

- **Entorno:** FLOCI (emulación local de AWS vía Docker Compose).
- **Entrada única:** Nginx reverse proxy como punto único para usuarios.
- **Datos:** RDS (PostgreSQL) para categorías y productos; DynamoDB para atributos
  variables y estado de imagen; S3 con dos buckets (originales y miniaturas).
- **Procesamiento:** AWS Lambda síncrona genera miniaturas de hasta 300x300 px.
- **Despliegue:** ECR para las imágenes Docker propias y EKS para escalamiento
  y autorrecuperación.

Diagrama: `docs/arquitectura.drawio` · Fuente textual: `docs/arquitectura.mmd` ·
PNG: `docs/evidencias/ETAPA_1/arquitectura.png` · Documento: `docs/ETAPA_1_ARQUITECTURA.md`

## Estructura

    frontend/   Aplicación web (formulario, catálogo, detalle)
    backend/    API Node.js 22 (pnpm) + Dockerfile
    proxy/      Configuración de Nginx (reverse proxy)
    k8s/        Manifiestos de EKS (Deployments, Services, Secrets)
    scripts/    Scripts reproducibles de creación y carga
    docs/       Documentación, diagramas y evidencias por etapa

## Reglas del proyecto

- Gestor de paquetes **exclusivamente `pnpm`** en todo el ecosistema Node.js.
- Python solo donde se requiera (Lambda), siempre dentro de un `venv`.
- Toda evidencia organizada en `docs/evidencias/ETAPA_<N>/`.

## Integrantes y Asignación de Etapas

| Integrante | GitHub | Etapas Asignadas |
|---|---|---|
| ZarielPB | @ZarielPB | 1 (Arquitectura), 3 (S3/Lambda), 5 (Frontend), 7 (EKS) |
| jeysi702 | @jeysi702 | 2 (Persistencia), 4 (Backend API), 6 (ECR) |

## Estado del Proyecto

- [x] Etapa 1 — Diseño de la arquitectura ✅
- [x] Etapa 2 — Persistencia con RDS y DynamoDB✅
- [ ] Etapa 3 — AWS con S3 y Lambda
- [ ] Etapa 4 — Backend con API y endpoints
- [ ] Etapa 5 — Frontend con dashboard del catálogo
- [ ] Etapa 6 — Publicación de imágenes en ECR
- [ ] Etapa 7 — Despliegue y validación en EKS

## Enlaces

- **Repositorio:** https://github.com/ZarielPB/EvaluacionCloud
