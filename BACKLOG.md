# Backlog

## Ripper lifecycle improvements

- Prevent unintended re-rips after successful completion/eject.
  - Observed on `drive-04` during live server testing on 2026-10-02.
  - Behavior: rip finished, tray opened, then later closed again and the same disc was auto-ripped a second time.
  - Later also observed on other drives (`drive-10`, `drive-11`), so this is not isolated to one device.
  - Likely area: interaction between tray state refresh, `AUTO_RIP=true`, and post-completion tray/media detection in `apps/ripper/src/controller.ts`.
  - Desired behavior: once a disc has completed successfully and been ejected, do not auto-start another rip for the same still-present disc unless there is a clear new insertion / user action.
  - Improvement: track a stable per-drive disc identity (for example disc ID / TOC signature) and refuse auto-ripping the same disc again on that drive after a successful completion until the drive has seen a confirmed disc change or explicit user override.

## Frontend / live status improvements

- Improve live rip status rendering in the web UI.
  - Observed during live server testing on 2026-10-02.
  - Current issues:
    - the currently ripping album/artist metadata does not reliably appear or update while a job is active
    - the progress bar does not update reliably during active ripping
    - the displayed state flickers between generic `ripping` and more specific per-track progress/status text
  - Desired behavior: the dashboard should present stable, continuously updating active-rip metadata and progress without flicker or regressions between coarse and detailed states.
