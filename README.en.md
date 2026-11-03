# dsh-desktop-restart-button

> A one-click restart button for the DeepSeek Harness **desktop** app caption bar, next to "应用 / 编辑" (Application / Edit).

![Restart button in the caption bar](assets/caption-bar.png)

After changing plugin config, installing a plugin, or when the UI gets stuck, you no longer need Task Manager or a full close-and-reopen — one click restarts the app. An optional policy asks for confirmation only when sessions or background jobs are actually running, so a stray click cannot kill your in-flight work.

## Install

```sh
dsh plugin --profile web add dsh-desktop-restart-button
```

The desktop app uses the profile name `desktop`, so you can also install it there:

```sh
dsh plugin --profile desktop add dsh-desktop-restart-button
```

Restart DeepSeek Harness once after installing (that last manual restart is unavoidable 🙂); the button then appears in the caption bar.

## Features

- **One-click restart** — click `⟳ 重启`, the app closes and reopens automatically.
- **Configurable policy** — click `▾`; the toggle "有任务运行时先确认" (confirm when tasks are running) is on by default:
  - on: query state first and show a confirmation dialog **only** when a session or background job is running;
  - off: restart immediately, regardless of running work.
- **Visible state** — the panel shows the number of running sessions and background jobs; the dialog spells them out.
- **Timeout fallback** — if the page is not back within 120 s, a notice with a "refresh" button appears instead of spinning forever.

## Requirements

- DeepSeek Harness **desktop** build (Electron shell). In a plain web runtime the button is not rendered and the restart endpoint refuses to run.
- **Windows** (the restart helper uses PowerShell + WMI).
- Node.js ≥ 20 (the bundled runtime is enough). No third-party dependencies.

## How the restart works

The desktop shell keeps its host process inside a `KILL_ON_JOB_CLOSE` job object and exposes no restart/quit channel, so a helper spawned by the plugin would die with the window.

The plugin therefore:

1. registers two loopback-only routes on the Host (`GET /dsh-desktop-restart-button/state`, `POST /dsh-desktop-restart-button/restart`, guarded by a custom header against cross-site requests);
2. writes a PowerShell helper that starts a VBS backstop through **WMI `Win32_Process.Create`** — WMI-created processes live outside the app's job object and survive the kill;
3. kills every process of the same executable, then the shell and the host; the VBS waits for both PIDs to disappear and starts `DeepSeek Harness.exe` again;
4. the app's single-instance lock makes a duplicate launch harmless.

The UI half is a `shell.overlay` slot entry: it measures the real caption menu, matches the shipped buttons' size/typography, and uses the app's theme tokens.

## Known limitations

- **Hard restart**: no graceful shutdown; in-flight turns are interrupted (hence the default confirmation policy).
- Restarts the whole app — not a single host or plugin hot reload.
- Windows desktop only.

## License

[MIT](LICENSE)
