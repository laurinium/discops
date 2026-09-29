FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json* tsconfig.json eslint.config.mjs .prettierrc ./
COPY packages ./packages
COPY apps/ripper ./apps/ripper
RUN npm install
RUN npm run build -w @rippy/shared && npm run build -w @rippy/config && npm run build -w @rippy/proto && npm run build -w @rippy/ripper

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends \
  abcde cd-discid cdparanoia flac eject sg3-utils python3 python3-discid udev util-linux glyrc wget ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/ripper/dist ./apps/ripper/dist
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD test -e "$DRIVE_DEVICE" || exit 1
CMD ["node","apps/ripper/dist/index.js"]
