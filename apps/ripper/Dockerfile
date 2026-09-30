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
ARG ABCDE_VERSION=2.12.2
RUN apt-get update && apt-get install -y --no-install-recommends \
  abcde cd-discid cdparanoia flac eject sg3-utils python3 python3-libdiscid udev util-linux glyrc wget ca-certificates \
  libmusicbrainz-discid-perl libwebservice-musicbrainz-perl sensible-utils \
  && wget -O /tmp/abcde.deb "https://github.com/poddmo/abcde/releases/download/${ABCDE_VERSION}/abcde_${ABCDE_VERSION}-1_all.deb" \
  && dpkg -i /tmp/abcde.deb \
  && abcde -v \
  && rm -f /tmp/abcde.deb \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/ripper/dist ./apps/ripper/dist
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD test -e "$DRIVE_DEVICE" || exit 1
CMD ["node","apps/ripper/dist/index.js"]
