# El proxy no necesita compilar nada: solo es Nginx con una configuracion
# propia que enruta por ruta.
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

# 127.0.0.1 y no localhost: en Alpine, localhost resuelve primero a ::1 y Nginx
# escucha solo en IPv4, asi que el healthcheck fallaria con "connection refused".
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]