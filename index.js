/**
 * dsh-desktop-restart-button — Host half.
 *
 * Serves two same-origin routes used by the caption-bar restart button:
 *   GET  /restart-button/state   running sessions / background jobs + restart flag
 *   POST /restart-button/restart relaunch the desktop app via a detached helper
 *
 * The desktop shell owns the application process and exposes no restart channel to
 * plugins, so the restart itself is performed by a detached PowerShell helper that
 * stops the Electron main process and this Host process, then starts the app again.
 * A watchdog helper relaunches the app if the first attempt did not come back.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const name = 'dsh-desktop-restart-button'

const STATE_PATH = '/dsh-desktop-restart-button/state'
const RESTART_PATH = '/dsh-desktop-restart-button/restart'
const HELPER_DIR = join(tmpdir(), 'dsh-desktop-restart-button')

/** Set once a restart was requested, so the page can tell the old host from a new one. */
let restarting = false

function isDesktopHost() {
  return Boolean(process.env.ELECTRON_RUN_AS_NODE)
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(value))
}

function sameAuthority(origin, hostHeader) {
  try {
    const left = new URL(origin)
    const right = new URL(`http://${hostHeader}`)
    return left.hostname === right.hostname && left.port === right.port
  } catch (error) {
    return false
  }
}

/** Requests must prove they come from our own page (custom header blocks plain CSRF). */
function isTrusted(request) {
  if (request.headers['x-dsh-desktop-restart-button'] !== '1') return false
  const origin = request.headers.origin
  if (origin === undefined || origin === '' || origin === 'null') return true
  if (origin.startsWith('dsh-app:')) return true
  const hostHeader = request.headers.host
  return hostHeader !== undefined && sameAuthority(origin, hostHeader)
}

function safe(callback, fallback) {
  try {
    return callback()
  } catch (error) {
    return fallback
  }
}

/**
 * Count what a restart would interrupt: live agents that are running (or have queued
 * work) plus running/stopping background jobs, mirroring the desktop shell's own
 * "active tasks" inspection.
 */
function collectState(ctx) {
  const state = { busy: false, sessions: 0, jobs: 0, restarting, desktop: isDesktopHost() }
  const agents = safe(() => ctx.get('agents'), undefined)
  const jobs = safe(() => ctx.get('jobs'), undefined)
  const live = safe(() => agents?.list?.() ?? [], []) ?? []

  if (Array.isArray(live)) {
    for (const agent of live) {
      const inbox = agent?.inbox
      const queued = (inbox?.nextTurn?.length ?? 0) + (inbox?.nextStep?.length ?? 0)
      if (agent?.status === 'running' || queued > 0) state.sessions += 1
    }
  }

  const activeJobs = new Set()
  const collectJobs = (caller) => {
    const list = safe(() => jobs?.list?.(caller) ?? [], []) ?? []
    if (!Array.isArray(list)) return
    for (const job of list) {
      if (job && (job.status === 'running' || job.status === 'stopping')) activeJobs.add(job.id)
    }
  }
  if (Array.isArray(live)) {
    for (const agent of live) if (agent?.id) collectJobs(agent.id)
  }
  collectJobs(undefined)

  state.jobs = activeJobs.size
  state.busy = state.sessions > 0 || state.jobs > 0
  return state
}

function powershellScript(lines) {
  return lines.join('\r\n') + '\r\n'
}

/**
 * Backstop launcher. Started by the helper through WMI, so it lives outside the shell's
 * job object (kill-on-job-close would otherwise tear it down together with the app).
 * It reads the launcher path the helper recorded, waits for the old processes to be
 * gone, and restarts the app. A duplicate start is harmless (single instance lock).
 */
function backstopScript(launcherPath) {
  return [
    `' dsh-desktop-restart-button backstop launcher`,
    `WScript.Sleep 2000`,
    `Set fso = CreateObject("Scripting.FileSystemObject")`,
    `If Not fso.FileExists("${launcherPath}") Then WScript.Quit 0`,
    `Set stream = fso.OpenTextFile("${launcherPath}", 1)`,
    `lines = Split(stream.ReadAll, vbCrLf)`,
    `stream.Close`,
    `exe = Trim(lines(0))`,
    `If exe = "" Then WScript.Quit 0`,
    `If Not fso.FileExists(exe) Then WScript.Quit 0`,
    `shellPid = Trim(lines(1))`,
    `hostPid = Trim(lines(2))`,
    `On Error Resume Next`,
    `Set wmi = GetObject("winmgmts:\\\\.\\root\\cimv2")`,
    `waited = 0`,
    `Do While waited < 15000`,
    `  alive = False`,
    `  If Len(shellPid) > 0 And shellPid <> "0" Then`,
    `    Err.Clear`,
    `    Set found = wmi.ExecQuery("SELECT ProcessId FROM Win32_Process WHERE ProcessId = " & shellPid)`,
    `    If Err.Number = 0 Then If found.Count > 0 Then alive = True`,
    `  End If`,
    `  If Len(hostPid) > 0 And hostPid <> "0" Then`,
    `    Err.Clear`,
    `    Set found = wmi.ExecQuery("SELECT ProcessId FROM Win32_Process WHERE ProcessId = " & hostPid)`,
    `    If Err.Number = 0 Then If found.Count > 0 Then alive = True`,
    `  End If`,
    `  If Not alive Then Exit Do`,
    `  WScript.Sleep 500`,
    `  waited = waited + 500`,
    `Loop`,
    `WScript.Sleep 1000`,
    `On Error GoTo 0`,
    `Set sh = CreateObject("WScript.Shell")`,
    `sh.Run """" & exe & """", 1, False`,
    ``,
  ].join('\r\n')
}

export function writeHelpers(shellPid, hostPid) {
  mkdirSync(HELPER_DIR, { recursive: true })
  const stamp = `${Date.now().toString(36)}-${hostPid}`
  const logPath = join(HELPER_DIR, `restart-${stamp}.log`)
  const launcherPath = join(HELPER_DIR, `launcher-${stamp}.txt`)
  const donePath = join(HELPER_DIR, `relaunched-${stamp}.flag`)
  const restartPath = join(HELPER_DIR, `restart-${stamp}.ps1`)
  const backstopPath = join(HELPER_DIR, `backstop-${stamp}.vbs`)

  const restartScript = powershellScript([
    `$ErrorActionPreference = 'SilentlyContinue'`,
    `function Write-Log([string] $line) { Add-Content -LiteralPath '${logPath}' -Value ('[' + (Get-Date -Format o) + '] ' + $line) }`,
    `Start-Sleep -Milliseconds 700`,
    `$shellPid = ${shellPid}`,
    `$hostPid = ${hostPid}`,
    `$backstopPath = '${backstopPath}'`,
    `$info = Get-Process -Id $shellPid`,
    `$exe = if ($info) { $info.Path } else { '' }`,
    `if (-not $exe) { Write-Log ('aborted: no launcher path for pid ' + $shellPid); exit 1 }`,
    `if (-not (Test-Path -LiteralPath $exe)) { Write-Log ('aborted: launcher missing: ' + $exe); exit 1 }`,
    `Set-Content -LiteralPath '${launcherPath}' -Value @($exe, [string]$shellPid, [string]$hostPid)`,
    // The application runs the Host inside a job object with KILL_ON_JOB_CLOSE, so every
    // process this helper starts would be killed the moment the shell exits. WMI creates
    // the backstop in a separate process tree instead, which is what makes the relaunch
    // survive the kill below.
    `$spawn = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = 'wscript.exe //B "' + $backstopPath + '"' }`,
    `Write-Log ('backstop start: wmi=' + $spawn.ReturnValue + ' pid=' + $spawn.ProcessId)`,
    `if ($spawn.ReturnValue -ne 0) {`,
    `  Start-Process -FilePath 'wscript.exe' -ArgumentList @('//B', ('"' + $backstopPath + '"'))`,
    `  Write-Log 'backstop start: fallback'`,
    `}`,
    `Write-Log ('restarting; exe=' + $exe + '; shell=' + $shellPid + '; host=' + $hostPid)`,
    `Get-Process | Where-Object { $_.Path -eq $exe -and $_.Id -ne $shellPid -and $_.Id -ne $hostPid } | Stop-Process -Force`,
    `Set-Content -LiteralPath '${donePath}' -Value 'kill-issued'`,
    `Stop-Process -Id $shellPid -Force`,
    `Start-Sleep -Milliseconds 250`,
    `Stop-Process -Id $hostPid -Force`,
    `Write-Log 'kill issued'`,
  ])

  writeFileSync(restartPath, restartScript, 'utf8')
  writeFileSync(backstopPath, backstopScript(launcherPath), 'utf8')
  return { logPath, restartPath }
}

function scheduleRestart() {
  const shellPid = process.ppid
  const hostPid = process.pid
  if (!Number.isInteger(shellPid) || shellPid <= 0 || shellPid === hostPid) {
    throw new Error('unexpected parent process')
  }
  const { logPath, restartPath } = writeHelpers(shellPid, hostPid)
  spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', restartPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref()
  return logPath
}

function handleState(ctx, request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD' })
    response.end()
    return
  }
  sendJson(response, 200, collectState(ctx))
}

function handleRestart(request, response) {
  if (request.method !== 'POST') {
    response.writeHead(405, { allow: 'POST' })
    response.end()
    return
  }
  if (!isTrusted(request)) {
    sendJson(response, 403, { ok: false, error: 'untrusted origin' })
    return
  }
  if (!isDesktopHost()) {
    sendJson(response, 200, { ok: false, desktop: false, reason: 'not-desktop' })
    return
  }
  if (restarting) {
    sendJson(response, 409, { ok: false, reason: 'already-restarting' })
    return
  }

  let logPath = ''
  try {
    logPath = scheduleRestart()
  } catch (error) {
    sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
    return
  }
  restarting = true
  sendJson(response, 202, { ok: true, desktop: true, restarting: true })
  console.log(`[dsh-desktop-restart-button] restart requested (helper log: ${logPath})`)
}

/** TEMPORARY diagnostic: report whether a helper spawned by this Host lands in a job object. */
function handleDiag(response, probe) {
  const lines = [
    `$ErrorActionPreference = 'SilentlyContinue'`,
    `Add-Type @'`,
    `using System;`,
    `using System.Runtime.InteropServices;`,
    `public class J2 {`,
    `  [DllImport("kernel32.dll")] public static extern bool IsProcessInJob(IntPtr p, IntPtr j, out bool r);`,
    `  [DllImport("kernel32.dll")] public static extern IntPtr GetCurrentProcess();`,
    `}`,
    `'@`,
    `$inJob = $false`,
    `[void][J2]::IsProcessInJob([J2]::GetCurrentProcess(), [IntPtr]::Zero, [ref]$inJob)`,
    `$parent = (Get-CimInstance Win32_Process -Filter "ProcessId=$PID").ParentProcessId`,
    `$grand = (Get-CimInstance Win32_Process -Filter "ProcessId=$parent").ParentProcessId`,
    `Write-Output ("pid=" + $PID + ";inJob=" + $inJob + ";parent=" + $parent + ";grand=" + $grand)`,
    `foreach ($id in @($parent, $grand)) {`,
    `  $p = Get-Process -Id $id -ErrorAction SilentlyContinue`,
    `  Write-Output ("proc " + $id + " = " + $p.ProcessName + " | " + $p.Path)`,
    `}`,
  ]
  if (probe === 'wmi') {
    const marker = 'C:\\Users\\15180\\Documents\\deepseek-harness\\default-workspace\\.tmp\\wmi-probe.txt'
    lines.push(
      `$spawn = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = 'cmd.exe /c echo wmiprobe> "${marker}"' }`,
      `Write-Output ("wmiCreate return=" + $spawn.ReturnValue + "; pid=" + $spawn.ProcessId)`,
      `Start-Sleep -Milliseconds 800`,
      `$probe = Get-CimInstance Win32_Process -Filter "ProcessId=" + $spawn.ProcessId`,
      `Write-Output ("child alive=" + [bool]$probe + "; outfile=" + (Test-Path -LiteralPath '${marker}'))`,
    )
  }
  if (probe === 'job') {
    lines.push(
      `Add-Type -TypeDefinition @'`,
      `using System;`,
      `using System.Runtime.InteropServices;`,
      `[StructLayout(LayoutKind.Sequential)] public struct BasicLimit {`,
      `  public long PerProcessUserTimeLimit; public long PerJobUserTimeLimit;`,
      `  public uint LimitFlags; public UIntPtr MinimumWorkingSetSize; public UIntPtr MaximumWorkingSetSize;`,
      `  public uint ActiveProcessLimit; public UIntPtr Affinity; public uint PriorityClass; public uint SchedulingClass;`,
      `}`,
      `[StructLayout(LayoutKind.Sequential)] public struct IoCounters {`,
      `  public ulong ReadOperationCount; public ulong WriteOperationCount; public ulong OtherOperationCount;`,
      `  public ulong ReadTransferCount; public ulong WriteTransferCount; public ulong OtherTransferCount;`,
      `}`,
      `[StructLayout(LayoutKind.Sequential)] public struct ExtLimit {`,
      `  public BasicLimit BasicLimitInformation; public IoCounters IoInfo;`,
      `  public UIntPtr ProcessMemoryLimit; public UIntPtr JobMemoryLimit;`,
      `  public UIntPtr PeakProcessMemoryUsed; public UIntPtr PeakJobMemoryUsed;`,
      `}`,
      `public class JobQuery {`,
      `  [DllImport("kernel32.dll", SetLastError = true)]`,
      `  public static extern bool QueryInformationJobObject(IntPtr job, int infoClass, out ExtLimit info, int length, out int returned);`,
      `}`,
      `'@`,
      `$limit = New-Object ExtLimit`,
      `$returned = 0`,
      `$ok = [JobQuery]::QueryInformationJobObject([IntPtr]::Zero, 9, [ref]$limit, [System.Runtime.InteropServices.Marshal]::SizeOf($limit), [ref]$returned)`,
      `$flags = $limit.BasicLimitInformation.LimitFlags`,
      `Write-Output ("jobQuery ok=" + $ok + "; flags=0x" + $flags.ToString('X') + "; killOnClose=" + (($flags -band 0x2000) -ne 0) + "; breakaway=" + (($flags -band 0x1000) -ne 0))`,
    )
  }
  const script = lines.join('\r\n')
  const scriptPath = join(HELPER_DIR, `diag-${Date.now().toString(36)}.ps1`)
  mkdirSync(HELPER_DIR, { recursive: true })
  writeFileSync(scriptPath, script, 'utf8')
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
    windowsHide: true,
  })
  let out = ''
  child.stdout.on('data', (chunk) => {
    out += chunk
  })
  child.stderr.on('data', (chunk) => {
    out += chunk
  })
  child.on('close', () => {
    sendJson(response, 200, { output: out.trim().split(/\r?\n/) })
  })
}

/**
 * Mount the restart routes once webServer is ready.
 * @param ctx - Cordis host context.
 */
export function apply(ctx) {
  ctx.inject(['webServer'], (host) => {
    const webServer = host.webServer
    host.effect(() => {
      const disposers = []
      const mount = (path, handler) => {
        try {
          disposers.push(webServer.register({ kind: 'exact', path, handler }))
        } catch (error) {
          console.error(`[dsh-desktop-restart-button] failed to register ${path}`, error)
        }
      }
      mount(STATE_PATH, (request, response) => handleState(ctx, request, response))
      mount(RESTART_PATH, (request, response) => handleRestart(request, response))
      // Process-tree probe, only for debugging the desktop relaunch helper.
      if (process.env.DSH_RESTART_BUTTON_DEBUG === '1') {
        mount('/dsh-desktop-restart-button/diag', (request, response) => {
          if (!isTrusted(request)) {
            sendJson(response, 403, { ok: false, error: 'untrusted origin' })
            return
          }
          const probe = safe(() => new URL(request.url ?? '/', 'http://localhost').searchParams.get('probe'), null)
          handleDiag(response, probe)
        })
      }
      return () => {
        for (const dispose of disposers) {
          try {
            dispose()
          } catch (error) {
            /* already gone */
          }
        }
      }
    }, 'dsh-desktop-restart-button: http routes')
  })
}
