FROM node:22-bookworm-slim AS build
WORKDIR /app
ARG VITE_API_BASE=
ENV VITE_API_BASE=$VITE_API_BASE
COPY package.json package-lock.json* tsconfig.json ./
COPY packages/shared ./packages/shared
COPY apps/frontend ./apps/frontend
RUN npm install
RUN npm run build -w @rippy/shared && npm run build -w @rippy/frontend

FROM nginx:1.27-alpine
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
