# dsh-desktop-restart-button

> 在 DeepSeek Harness 桌面版窗口标题栏的「应用 / 编辑」旁边，加一个一键重启按钮。

![标题栏里的重启按钮](assets/caption-bar.png)

改完插件配置、装完插件、或者界面卡住的时候，不用再去任务管理器翻进程、也不用整个关掉应用重开——点一下就能重启，并且可以设置「有任务在跑时先确认」，避免误杀正在进行的会话。

## 安装

本插件只在 DeepSeek Harness **桌面版** 生效（按钮挂在窗口标题栏上），桌面版内部的 profile 名为 `desktop`：

```sh
dsh plugin --profile desktop add dsh-desktop-restart-button
```

也可以在应用左侧栏的「插件」页面里安装。

装好后重启一次 DeepSeek Harness（这一步还是得手动来一次 🙂），标题栏就会出现按钮。

## 功能

- **一键重启**：点「⟳ 重启」立即重启应用，窗口自动重新打开。
- **重启策略可切换**：点右侧「▾」打开设置面板，开关「有任务运行时先确认」。
  - 开启（默认）：重启前先查询当前状态；**只有检测到正在运行的会话或后台任务时**才弹确认框，否则直接重启。
  - 关闭：不管有没有任务在跑，点一下就重启。
- **状态可见**：设置面板会显示当前正在运行的会话数和后台任务数；确认框里也会写明「检测到 N 个正在运行的任务（x 个会话、y 个后台任务）」。
- **超时提示**：如果重启后 120 秒内页面还没恢复，会显示提示和「刷新页面」按钮，而不是一直转圈。

## 使用

| 操作 | 行为 |
| --- | --- |
| 点「⟳ 重启」 | 按当前策略重启 |
| 点「▾」 | 打开设置面板（状态、策略开关、立即重启） |
| 有任务时确认框 | 「取消」/「仍要重启」 |

重启策略保存在 `localStorage` 的 `dsh-desktop-restart-button:policy`（值为 `confirm` 或 `immediate`），按窗口持久化。

## 环境要求

- DeepSeek Harness **桌面版**（Electron 壳；网页版运行时不显示该按钮，重启接口也会拒绝执行）
- **Windows**（重启助手使用 PowerShell + WMI；其他平台暂未适配）
- Node.js ≥ 20（DSH 自带运行时即可）
- 无任何第三方依赖

## 它是怎么重启的

桌面端应用把宿主进程放在一个 `KILL_ON_JOB_CLOSE` 的作业对象里，所以插件自己 spawn 的助手会跟着窗口一起被杀；应用也没有对外暴露任何重启/退出通道。

因此插件这样做：

1. **Host 侧**（`index.js`）注册两个只在本机可用的路由：`GET /dsh-desktop-restart-button/state`（当前是否有任务在跑）和 `POST /dsh-desktop-restart-button/restart`（带自定义请求头校验，拒绝跨站请求）。
2. 收到重启请求后，写一个 PowerShell 助手，用 **WMI `Win32_Process.Create`** 拉起一个 VBS 后备启动器——WMI 创建的进程不在应用的作业对象里，所以能活过窗口被杀。
3. 助手先杀掉同可执行文件的进程（含渲染进程），再依次结束壳进程和宿主进程；VBS 等这两个 PID 消失后，重新启动 `DeepSeek Harness.exe`。
4. 应用有单实例锁，即使重复启动也只会聚焦已有窗口，不会开出两个。

界面部分是一个 `shell.overlay` 槽位组件：按标题栏菜单的实际位置定位，样式复用应用主题变量，和「应用 / 编辑」按钮同高同字号。

## 已知限制

- **硬重启**：不做优雅退出，正在进行中的会话会被中断——这也是默认「有任务时先确认」的原因。
- 只能重启整个应用，不能只重启宿主或热重载某个插件（宿主生命周期由桌面壳掌握）。
- 仅适配 Windows 桌面版；网页版（`dsh web`）里按钮不会出现。

## 开发

- `index.js`：Host 半，HTTP 路由 + 重启助手脚本。
- `client.js`：Client 半，`shell.overlay` 槽位里的按钮、设置面板与确认框（纯 JS + `React.createElement`，无构建步骤）。
- 调试路由默认关闭，设置环境变量 `DSH_RESTART_BUTTON_DEBUG=1` 后可用 `GET /dsh-desktop-restart-button/diag?probe=wmi|job` 查看进程作业与 WMI 探测结果。
- 改动后重新加载插件：`remove_bundle` 再 `install_bundle` 指向本目录，或者重启一次应用。

## 许可证

[MIT](LICENSE)
