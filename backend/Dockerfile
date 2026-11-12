# Node 20 LTS (matches CI)
FROM node:24-alpine

ENV NODE_ENV=production

WORKDIR /app

# Install production dependencies only (reproducible, smaller image)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy the application and run as the unprivileged "node" user, not root
COPY --chown=node:node . .
USER node

EXPOSE 5000

# Readiness check: fails if MongoDB or Redis is unreachable
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health/ready || exit 1

CMD ["node", "server.js"]
