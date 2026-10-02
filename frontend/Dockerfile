# Imagen multi-etapa: primero se compila con Node, despues solo queda el
# bundle estatico servido por Nginx. El frontend no corre Node en produccion.
FROM node:22-alpine AS build

WORKDIR /app

# corepack habilita pnpm con la version fijada abajo; el repositorio usa
# pnpm exclusively (packageManager en package.json).
RUN corepack enable

# Las dependencias se copian antes que el codigo para que la capa se reutilice
# mientras no cambie el lockfile.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# La URL de la API se resuelve en tiempo de build porque Vite la incrusta en el
# bundle. En produccion tiene que ser la ruta relativa /api: el navegador nunca
# habla con la API directamente, pasa por el proxy Nginx.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

RUN pnpm build

# ------------------------------------------------------------------ servicio
FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8081

# 127.0.0.1 y no localhost: en Alpine, localhost resuelve primero a ::1 y Nginx
# escucha solo en IPv4, asi que el healthcheck fallaria con "connection refused".
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8081/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]