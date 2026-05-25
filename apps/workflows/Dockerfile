FROM node:20-alpine AS base

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY apps/workflows/package*.json ./apps/workflows/
COPY packages/types/package*.json ./packages/types/

# Install dependencies
RUN npm ci --workspace=apps/workflows --workspace=packages/types

# Copy source
COPY apps/workflows ./apps/workflows
COPY packages/types ./packages/types
COPY tsconfig.json ./

# Build
RUN npm run build --workspace=apps/workflows

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy package files and install production deps only
COPY package*.json ./
COPY apps/workflows/package*.json ./apps/workflows/
COPY packages/types/package*.json ./packages/types/

RUN npm ci --workspace=apps/workflows --workspace=packages/types --omit=dev

# Copy built artifacts
COPY --from=base /app/apps/workflows/dist ./apps/workflows/dist
COPY --from=base /app/packages/types/dist ./packages/types/dist

EXPOSE 9080

CMD ["node", "apps/workflows/dist/server.js"]
