# Evidencias — Etapa 5: Frontend del catálogo

Capturas y salidas de verificación del frontend contra la API real (FLOCI + RDS).
Todo se obtuvo a través del proxy de producción en `http://localhost:8080`, no
directamente contra la API.

## Capturas de pantalla

| Archivo | Qué muestra |
|---|---|
| `home.png` | Portada con las tarjetas de acceso a catálogo y registro |
| `catalogo.png` | Catálogo con productos publicados, filtros y búsqueda |
| `registrar.png` | Formulario de registro con atributos dinámicos según la categoría |
| `detalle-publicado.png` | Detalle de un producto `PUBLICADO` con miniatura y atributos |
| `detalle-pendiente.png` | Detalle `PENDIENTE` sin imagen, con opción de subirla |
| `detalle-error-reprocesar.png` | Detalle `PENDIENTE` con error de miniatura y botón de reprocesar |
| `detalle-no-encontrado.png` | Detalle de un `id` inexistente (`404 producto_no_encontrado`) |
| `detalle-id-invalido.png` | Detalle con `id` no numérico, sin llegar a llamar a la API |
| `ruta-no-encontrada.png` | Vista de ruta desconocida de la SPA |

## Salidas de verificación

| Archivo | Contenido |
|---|---|
| `01_api_detalle.json.txt` | Respuestas reales de `/api/salud`, `/api/categorias`, `/api/productos` y del detalle en sus tres estados |
| `02_codigos_de_error.txt` | Códigos HTTP comprobados: `400`, `404`, `409`, `413`, `415`, `200` |
| `03_pruebas_validacion.txt` | 35 casos de `validacion.ts` en verde |
| `04_contenedores_y_puertos.txt` | Estado de los contenedores y binds reales en el host |
| `05_log_proxy.txt` | Access log del proxy confirmando que el navegador pidió los datos |

## Notas sobre cómo se obtuvieron

- **El screenshot de Firefox headless dispara antes de que resuelva el `fetch`.**
  Cuando eso pasa la captura sale con el esqueleto de carga. El access log
  (`05_log_proxy.txt`) deja claro que la petición sí ocurrió, así que es un
  artefacto de la captura y no un fallo de la vista. Para evitarlo, cada captura
  se repitió hasta que el peso del PNG superara el umbral de la pantalla ya
  renderizada.
- **Los productos de prueba no se limpian.** La API no expone `DELETE`, así que
  los registros creados para verificar (`LOM-TST-*`, `LOM-ERR-*`, `LOM-ORIGINAL-*`,
  `LOM-PROXY-*`) quedan en el catálogo.