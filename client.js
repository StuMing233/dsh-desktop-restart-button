window.__ModuleLoader__.load({
  id: 'dsh-desktop-restart-button',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useRef, useState } = React

    const ID = 'dsh-desktop-restart-button'
    const API = '/dsh-desktop-restart-button'
    const POLICY_KEY = 'dsh-desktop-restart-button:policy'
    const MENU_SELECTOR = '[data-windows-menu]'
    const POLL_LIMIT_MS = 120000

    const CSS = `
.rsb-root {
  position: fixed; top: 0; z-index: 1101;
  height: var(--dsh-windows-titlebar-height, 40px);
  display: flex; align-items: center; gap: 2px;
  font-family: var(--dsw-font-family); -webkit-app-region: no-drag;
  pointer-events: auto; user-select: none;
}
.rsb-btn {
  display: inline-flex; align-items: center; gap: 5px;
  height: 28px; padding: 0 10px; border: 0; border-radius: 6px;
  background: transparent; color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 14px; cursor: default;
  -webkit-app-region: no-drag;
}
.rsb-btn:hover, .rsb-btn[aria-expanded="true"] {
  background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary);
}
.rsb-btn:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: -2px; }
.rsb-caret { padding: 0 6px; gap: 0; }
.rsb-glyph { display: inline-flex; align-items: center; }
.rsb-caret-glyph { font-size: 11px; line-height: 1; opacity: 0.75; }

.rsb-panel {
  position: absolute; top: calc(100% + 4px); left: 0; width: 304px; box-sizing: border-box;
  padding: 14px 16px 12px; border-radius: 10px;
  background: var(--dsw-alias-bg-layer-3); border: 1px solid var(--dsw-alias-border-l2);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.08);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family); font-size: 13px; line-height: 1.5;
  -webkit-app-region: no-drag; cursor: default;
}
.rsb-title { font-size: 14px; font-weight: 600; line-height: 1.4; margin: 0 0 6px; }
.rsb-desc { margin: 0 0 10px; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.rsb-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 0 2px; border-top: 1px solid var(--dsw-alias-border-l2);
}
.rsb-row-text { min-width: 0; }
.rsb-row-label { font-size: 13px; }
.rsb-row-hint { margin-top: 2px; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.rsb-switch {
  position: relative; flex: none; width: 34px; height: 20px; padding: 2px;
  border: 0; border-radius: 10px; background: var(--dsw-alias-border-l3);
  cursor: pointer; transition: background 0.15s ease;
  -webkit-app-region: no-drag;
}
.rsb-switch[aria-checked="true"] { background: var(--dsw-alias-button-primary-fill); }
.rsb-switch:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
.rsb-thumb {
  display: block; width: 16px; height: 16px; border-radius: 50%;
  background: var(--dsw-alias-switch-thumb, #fff);
  transition: transform 0.15s ease;
}
.rsb-switch[aria-checked="true"] .rsb-thumb { transform: translateX(14px); }
.rsb-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.rsb-action {
  height: 28px; padding: 0 12px; border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l3); background: transparent;
  color: var(--dsw-alias-label-primary); font-family: inherit; font-size: 13px; cursor: pointer;
  -webkit-app-region: no-drag;
}
.rsb-action:hover { background: var(--dsw-alias-interactive-bg-hover); }
.rsb-action-primary {
  border-color: transparent; background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground, #fff);
}
.rsb-action-primary:hover { background: var(--dsw-alias-button-primary-hover); }
.rsb-action-danger {
  border-color: transparent; background: var(--dsw-alias-state-error-primary);
  color: var(--dsw-alias-label-primary-foreground, #fff);
}
.rsb-action-danger:hover { background: var(--dsw-alias-state-error-primary); filter: brightness(1.05); }

.rsb-overlay {
  position: fixed; inset: 0; z-index: 3000;
  display: flex; align-items: center; justify-content: center;
  background: var(--dsw-alias-bg-mask-1);
  -webkit-app-region: no-drag; pointer-events: auto;
}
.rsb-card {
  min-width: 280px; max-width: min(420px, calc(100vw - 32px)); box-sizing: border-box;
  padding: 22px 24px; border-radius: 12px; text-align: center;
  background: var(--dsw-alias-bg-layer-3); border: 1px solid var(--dsw-alias-border-l2);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.28);
  color: var(--dsw-alias-label-primary); font-family: var(--dsw-font-family); font-size: 14px;
}
.rsb-spinner {
  width: 22px; height: 22px; margin: 0 auto 12px; border-radius: 50%;
  border: 2px solid var(--dsw-alias-border-l3);
  border-top-color: var(--dsw-alias-brand-primary);
  animation: rsb-spin 0.9s linear infinite;
}
@keyframes rsb-spin { to { transform: rotate(360deg); } }
.rsb-card-text { line-height: 1.6; }
.rsb-card-hint { margin-top: 6px; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
`

    function readPolicy() {
      try {
        return globalThis.localStorage?.getItem(POLICY_KEY) === 'immediate' ? 'immediate' : 'confirm'
      } catch (error) {
        return 'confirm'
      }
    }

    function writePolicy(value) {
      try {
        globalThis.localStorage?.setItem(POLICY_KEY, value)
      } catch (error) {
        /* private mode */
      }
    }

    async function readState() {
      const response = await fetch(API + '/state', {
        cache: 'no-store',
        headers: { accept: 'application/json' },
      })
      if (!response.ok) throw new Error('state ' + response.status)
      return await response.json()
    }

    async function requestRestart() {
      const response = await fetch(API + '/restart', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'content-type': 'application/json', 'x-dsh-desktop-restart-button': '1' },
        body: '{}',
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload && payload.error ? String(payload.error) : 'restart ' + response.status)
      }
      return payload || {}
    }

    function RefreshIcon() {
      return h(
        'svg',
        {
          width: 14,
          height: 14,
          viewBox: '0 0 16 16',
          fill: 'none',
          'aria-hidden': 'true',
          focusable: 'false',
        },
        h('path', {
          d: 'M13.4 8a5.4 5.4 0 1 1-1.58-3.82',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
        }),
        h('path', {
          d: 'M13.4 2.6v3.35h-3.35',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      )
    }

    function RestartControl() {
      const [anchor, setAnchor] = useState(null)
      const [panel, setPanel] = useState(null)
      const [policy, setPolicy] = useState(readPolicy)
      const [info, setInfo] = useState(null)
      const [phase, setPhase] = useState('idle')
      const [notice, setNotice] = useState('')
      const root = useRef(null)
      const mounted = useRef(true)

      useEffect(() => {
        const measure = () => {
          const host = document.querySelector(MENU_SELECTOR)
          const rect = host ? host.getBoundingClientRect() : null
          const next = rect && rect.width > 0 ? Math.round(rect.right) + 8 : null
          setAnchor((previous) => (previous === next ? previous : next))
        }
        let timer = 0
        const loop = () => {
          measure()
          timer = window.setTimeout(loop, 500)
        }
        loop()
        window.addEventListener('resize', measure)
        return () => {
          window.clearTimeout(timer)
          window.removeEventListener('resize', measure)
        }
      }, [])

      useEffect(() => {
        mounted.current = true
        return () => {
          mounted.current = false
        }
      }, [])

      useEffect(() => {
        if (panel === null) return undefined
        const onPointerDown = (event) => {
          const element = root.current
          if (element && event.target instanceof Node && element.contains(event.target)) return
          setPanel(null)
        }
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setPanel(null)
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown, true)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('keydown', onKeyDown, true)
        }
      }, [panel])

      const refresh = useCallback(async () => {
        try {
          const state = await readState()
          setInfo(state)
          return state
        } catch (error) {
          setInfo(null)
          return null
        }
      }, [])

      const beginRestart = useCallback(async () => {
        setPanel(null)
        setNotice('')
        setPhase('restarting')
        try {
          await requestRestart()
        } catch (error) {
          /* the host may stop before the response is flushed */
        }
        const startedAt = Date.now()
        const poll = async () => {
          if (!mounted.current) return
          try {
            const state = await readState()
            if (state && state.restarting !== true) {
              window.location.reload()
              return
            }
          } catch (error) {
            /* still down */
          }
          if (Date.now() - startedAt > POLL_LIMIT_MS) {
            setPhase('stalled')
            setNotice('重启超时。如果窗口没有自动重新打开，请手动启动 DeepSeek Harness。')
            return
          }
          window.setTimeout(poll, 800)
        }
        window.setTimeout(poll, 1000)
      }, [])

      const onRestartClick = useCallback(async () => {
        if (phase !== 'idle') return
        if (policy === 'immediate') {
          await beginRestart()
          return
        }
        const state = await refresh()
        if (state && state.busy) {
          setPanel('confirm')
          return
        }
        await beginRestart()
      }, [beginRestart, phase, policy, refresh])

      const onOptionsClick = useCallback(async () => {
        if (phase !== 'idle') return
        if (panel === 'settings') {
          setPanel(null)
          return
        }
        setPanel('settings')
        void refresh()
      }, [panel, phase, refresh])

      const togglePolicy = useCallback(() => {
        setPolicy((current) => {
          const next = current === 'confirm' ? 'immediate' : 'confirm'
          writePolicy(next)
          return next
        })
      }, [])

      if (anchor === null) return null

      const sessions = info && typeof info.sessions === 'number' ? info.sessions : 0
      const jobs = info && typeof info.jobs === 'number' ? info.jobs : 0
      const busy = Boolean(info && info.busy)
      const total = sessions + jobs
      const expanded = panel !== null ? 'true' : 'false'

      const statusLine = info === null
        ? '正在检查任务状态…'
        : busy
          ? '当前有 ' + total + ' 个任务正在运行（' + sessions + ' 个会话、' + jobs + ' 个后台任务）。'
          : '当前没有正在运行的任务。'

      const settingsPanel = h(
        'div',
        { className: 'rsb-panel', role: 'dialog', 'aria-label': '重启设置', 'aria-modal': 'false' },
        h('div', { className: 'rsb-title' }, '重启 DeepSeek Harness'),
        h('div', { className: 'rsb-desc' }, statusLine),
        h(
          'div',
          { className: 'rsb-row' },
          h(
            'div',
            { className: 'rsb-row-text' },
            h('div', { className: 'rsb-row-label' }, '有任务运行时先确认'),
            h(
              'div',
              { className: 'rsb-row-hint' },
              policy === 'confirm'
                ? '点击「重启」时先询问，确认后再重启。'
                : '点击「重启」立即重启，不会询问。',
            ),
          ),
          h(
            'button',
            {
              type: 'button',
              role: 'switch',
              className: 'rsb-switch',
              'aria-checked': policy === 'confirm' ? 'true' : 'false',
              'aria-label': '有任务运行时先确认',
              onClick: togglePolicy,
            },
            h('span', { className: 'rsb-thumb' }),
          ),
        ),
        h(
          'div',
          { className: 'rsb-actions' },
          h('button', { type: 'button', className: 'rsb-action', onClick: () => setPanel(null) }, '关闭'),
          h(
            'button',
            { type: 'button', className: 'rsb-action rsb-action-primary', onClick: () => void beginRestart() },
            '立即重启',
          ),
        ),
      )

      const confirmPanel = h(
        'div',
        { className: 'rsb-panel', role: 'alertdialog', 'aria-label': '确认重启', 'aria-modal': 'false' },
        h('div', { className: 'rsb-title' }, '确认重启？'),
        h(
          'div',
          { className: 'rsb-desc' },
          '检测到 ' + total + ' 个正在运行的任务（' + sessions + ' 个会话、' + jobs + ' 个后台任务）。重启会立即中断它们。',
        ),
        h(
          'div',
          { className: 'rsb-actions' },
          h('button', { type: 'button', className: 'rsb-action', onClick: () => setPanel(null) }, '取消'),
          h(
            'button',
            { type: 'button', className: 'rsb-action rsb-action-danger', onClick: () => void beginRestart() },
            '仍要重启',
          ),
        ),
      )

      const overlay = phase === 'idle'
        ? null
        : h(
            'div',
            { className: 'rsb-overlay', role: 'status', 'aria-live': 'polite' },
            h(
              'div',
              { className: 'rsb-card' },
              notice ? null : h('div', { className: 'rsb-spinner', 'aria-hidden': 'true' }),
              h('div', { className: 'rsb-card-text' }, notice || '正在重启 DeepSeek Harness…'),
              notice
                ? h(
                    'div',
                    { className: 'rsb-actions', style: { justifyContent: 'center' } },
                    h(
                      'button',
                      { type: 'button', className: 'rsb-action', onClick: () => window.location.reload() },
                      '刷新页面',
                    ),
                  )
                : h('div', { className: 'rsb-card-hint' }, '窗口会自动重新打开。'),
            ),
          )

      return h(
        React.Fragment,
        null,
        h(
          'div',
          { ref: root, className: 'rsb-root', style: { left: anchor + 'px' } },
          h(
            'button',
            {
              type: 'button',
              className: 'rsb-btn',
              title: policy === 'immediate' ? '重启 DeepSeek Harness（立即重启）' : '重启 DeepSeek Harness',
              'aria-label': '重启 DeepSeek Harness',
              'aria-haspopup': 'dialog',
              'aria-expanded': expanded,
              onClick: onRestartClick,
            },
            h('span', { className: 'rsb-glyph' }, h(RefreshIcon)),
            h('span', null, '重启'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'rsb-btn rsb-caret',
              title: '重启选项',
              'aria-label': '重启选项',
              'aria-haspopup': 'dialog',
              'aria-expanded': expanded,
              onClick: onOptionsClick,
            },
            h('span', { className: 'rsb-caret-glyph', 'aria-hidden': 'true' }, '▾'),
          ),
          panel === 'settings' ? settingsPanel : panel === 'confirm' ? confirmPanel : null,
        ),
        overlay,
      )
    }

    function apply(ctx) {
      ctx.effect(() => {
        const style = document.createElement('style')
        style.dataset.dshRestartButton = 'style'
        style.textContent = CSS
        document.head.append(style)
        return () => {
          style.remove()
        }
      }, 'dsh-desktop-restart-button: styles')

      ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register(
          { name: 'shell.overlay', id: ID, order: 10 },
          RestartControl,
        ),
      )
    }

    return { name: ID, inject: ['slots'], apply }
  },
})
