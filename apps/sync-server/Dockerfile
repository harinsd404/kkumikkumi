FROM node:24-bookworm-slim AS build
WORKDIR /src
RUN npm install --global pnpm@11.7.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/schema packages/schema
COPY apps/sync-server apps/sync-server
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @kkumikkumi/sync-server...
RUN pnpm --filter @kkumikkumi/sync-server build

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 DATA_DIR=/data
WORKDIR /app
RUN mkdir /data && chown node:node /data
COPY --from=build --chown=node:node /src/apps/sync-server/dist ./dist
USER node
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
