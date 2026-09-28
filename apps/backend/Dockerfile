FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json* tsconfig.json eslint.config.mjs .prettierrc ./
COPY packages ./packages
COPY apps/backend ./apps/backend
RUN npm install
RUN npm run build -w @rippy/shared && npm run build -w @rippy/config && npm run build -w @rippy/proto && npm run build -w @rippy/backend

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
EXPOSE 8080 50051
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","apps/backend/dist/index.js"]
