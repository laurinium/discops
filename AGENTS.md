# AGENTS.md

Guidance for coding agents working in this repository.

## Project summary

DiscOps / Rippymcripface is a self-hosted multi-drive Audio CD ripping app.

Architecture:

- `apps/frontend`: React + Vite dashboard using shadcn-style local UI components.
- `apps/backend`: Node/TypeScript HTTP/SSE API and gRPC coordinator.
- `apps/ripper`: one container per optical drive; talks to backend over gRPC; runs `abcde`/`cdparanoia`/`flac`.
- `packages/proto`: gRPC protobuf and generated TS types.
- `packages/shared`: shared state/types/schemas.
- `packages/config`: environment parsing.

Important principles:

- Preserve the frontend/backend/ripper architecture.
- Use one ripper container per physical drive.
- Use `abcde` as the ripping engine; do not replace with custom JS ripping.
- Favor ARM-inspired safe lifecycle behavior, but do not blindly port ARM.
- Avoid `privileged: true`; prefer explicit devices/caps.
- Successful rip means: abcde exits cleanly, expected FLAC count exists, `flac -t` passes, publish succeeds.
- Publish only after validation; use isolated job dirs and atomic publish.

## Common commands

Run from repo root:

```bash
npm run build
npm test
npm run lint
```

Useful frontend-only check:

```bash
npm run build -w @rippy/frontend
```

Regenerate proto types via normal build:

```bash
npm run build -w @rippy/proto
```

## Key files

- Ripping orchestration: `apps/ripper/src/abcde.ts`
- ARM-style validation/publish helpers: `apps/ripper/src/armAudio.ts`
- Ripper drive/controller logic: `apps/ripper/src/controller.ts`, `apps/ripper/src/drive.ts`
- Backend gRPC state handling: `apps/backend/src/grpc.ts`
- Backend HTTP API: `apps/backend/src/http.ts`
- Backend persistence: `apps/backend/src/store.ts`
- Frontend UI: `apps/frontend/src/main.tsx`, `apps/frontend/src/components/ui/*`
- Compose deployment: `compose.yaml`

## Ripping lifecycle expectations

Treat jobs as having explicit terminal states:

- `completed`
- `cancelled`
- `failed-*`
- `failed-interrupted`

Do not leave jobs permanently running. On restart or crash, stale running jobs should be marked interrupted.

Only explicit user/debug actions should cancel active ripping:

- cancel job
- eject/open tray
- reset drive
- container shutdown

Do **not** cancel a rip because polling briefly reports absent/not-ready media; optical drives can do this while `cdparanoia` owns the device.

## abcde / metadata notes

The ripper image uses the `poddmo/abcde` fork. Its output may differ from Debian stock abcde.

Important output patterns already handled:

- `Tracks queued:  01 02 ...` as authoritative audio track count.
- `Grabbing track NN...` / `outputting to ...trackNN.wav` as ripping progress.
- `-W disc,total` is used when MusicBrainz disc number is available.

MusicBrainz lookup should improve metadata/disc numbers, but network/DNS failure should be classified clearly as metadata/network failure.

## Docker / server deployment

Known server:

```text
arm@192.168.5.161:~/discops
```

SSH usually requires:

```bash
SSH_AUTH_SOCK=/home/laur/.1password/agent.sock ssh arm@192.168.5.161
```

Deploy/update typical command:

```bash
SSH_AUTH_SOCK=/home/laur/.1password/agent.sock ssh arm@192.168.5.161 'cd ~/discops && docker compose pull && docker compose up -d --force-recreate'
```

Avoid recreating ripper containers while active rips are running unless the user explicitly asks.

Current large-drive setup maps optical drives roughly as:

```text
drive-01  /dev/sr0   /dev/sg0
drive-02  /dev/sr1   /dev/sg1
drive-03  /dev/sr2   /dev/sg2
drive-04  /dev/sr3   /dev/sg4
drive-05  /dev/sr4   /dev/sg5
drive-06  /dev/sr5   /dev/sg6
drive-07  /dev/sr6   /dev/sg7
drive-08  /dev/sr7   /dev/sg8
drive-09  /dev/sr8   /dev/sg9
drive-10  /dev/sr9   /dev/sg10
drive-11  /dev/sr10  /dev/sg11
```

`/dev/sg3` is a hard disk on that host and must not be passed to a ripper.

## UI guidelines

The dashboard must stay compact for many drives. Keep drive cards small; put large content such as track lists and logs behind details dialogs/pages.

Existing UI components are local shadcn-style components in:

```text
apps/frontend/src/components/ui
```

Prefer using/extending those over ad-hoc raw controls.

## API / state expectations

Main endpoints:

- `GET /api/state`
- `GET /api/events` SSE
- `GET /api/status`
- `GET /api/albums`
- `POST /api/rippers/:ripperId/:command`
- `POST /api/debug/:command`

Debug commands include:

- `stopAllJobs`
- `openAllTrays`
- `closeAllTrays`
- `refreshAll`
- `resetAllDrives`

Guard dangerous UI actions with confirmation.

## Before committing

Always run:

```bash
npm run build && npm test && npm run lint
```

Commit messages should be concise and describe the behavioral change.
