FROM node:22-slim AS base
WORKDIR /app

# ─── Install dependencies ───
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && npm install pg @aws-sdk/client-sesv2 @aws-sdk/client-s3

# ─── Build ───
FROM base AS build
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src/ src/
RUN npx tsc

# ─── Runtime ───
FROM base AS runtime

# Install only the deps needed at runtime
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# Default config location
COPY autopilot.toml /etc/autopilot/config.toml

EXPOSE 3100

ENV NODE_ENV=production

ENTRYPOINT ["node", "dist/bin/serve.js"]
CMD ["--config", "/etc/autopilot/config.toml"]
