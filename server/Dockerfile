# FitTrack API
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
# The SQLite database lives here; mount a volume so it survives restarts
RUN mkdir -p /app/data && chown node:node /app/data
ENV DB_FILE=/app/data/fittrack.db PORT=4000
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "src/index.js"]
