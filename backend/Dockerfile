# Node 25+ elimino corepack de la imagen oficial, por eso pnpm se
# instala de forma explicita. La version 12.6.0 es la fijada en el campo
# packageManager de package.json.
FROM node:26-alpine

RUN npm install --global pnpm@12.6.0

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile

COPY src ./src

ENV NODE_ENV=production
EXPOSE 3000

USER node

CMD ["node", "src/server.js"]
