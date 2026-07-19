# Multi-stage build: compile TypeScript, then run the plain JS output with
# only production dependencies. Reads PORT from the environment (defaults
# to 3000 — see src/index.ts), so it works unmodified on Cloud Run or any
# other platform that injects its own PORT.
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
CMD ["node", "dist/index.js"]
