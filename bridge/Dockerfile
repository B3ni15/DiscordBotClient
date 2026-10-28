# syntax=docker/dockerfile:1

# The voice bridge: one Node process holding the Discord voice socket.
#
# Optional dependencies are required here: @snazzah/davey ships its native
# binary as a platform-specific optional package, so omitting them would leave
# the voice connection unable to start. The toolchain needed for a source build
# stays in the build stage.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    BRIDGE_HOST=0.0.0.0 \
    BRIDGE_PORT=8787

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

USER node
EXPOSE 8787
CMD ["node", "src/index.mjs"]
