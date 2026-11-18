FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force && mkdir uploads && chown node:node uploads
COPY --from=build /app/server ./server
COPY --from=build /app/dist ./dist
USER node
ENV HOST=0.0.0.0
EXPOSE 3001
CMD ["node", "server/index.js"]
