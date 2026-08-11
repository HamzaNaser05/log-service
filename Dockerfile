FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build


FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./

RUN npm ci --omit=dev \
    && npm cache clean --force

COPY --from=build --chown=node:node /app/dist ./dist

COPY --chown=node:node migrations ./migrations

USER node

CMD ["node", "dist/main.js"]