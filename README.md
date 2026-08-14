# dsh-quote-reply

> A [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) Web plugin that lets you **quote any fragment of a conversation and reply to it**.
>
> 一个 DeepSeek Harness Web 插件：**选中对话里任意一段文字 → 引用 → 单独回复**。

## 特性 Features

- 🎯 **浮动引用按钮**：拖选文字后松开鼠标，一个「引用」小按钮会**贴着鼠标**弹出，并**自动避让**浏览器扩展工具栏、菜单、弹窗等其他浮层（逐个候选位探测遮挡，选第一个空闲位置）；
- ✍️ 点击后选中文字以 Markdown 引用块（`> …`）进入输入框，输入框自动聚焦，直接打字回复；
- 🧭 键盘选择（Shift+方向键）同样支持，自动锚定选区末尾；
- 🆘 每条 AI 回复悬停后的操作行也有「引用」按钮（兜底）：有选中文字引用选中内容，无选中引用整条回复；
- 🔒 只在聊天区域内触发（侧边栏/设置页选中文字不会弹按钮），Esc 可收起；
- 🌏 中英双语界面文案。

## 用法 Usage

1. **引用某一段**：按住鼠标拖选对话中的文字 → 松开 → 点选区旁弹出的「引用」按钮 → 输入框出现引用块 → 打字回复；
2. **引用整条回复**：悬停该条回复 → 点操作行的「引用」按钮。

## 安装 Install

### 本机手动安装

1. 把本目录复制到 `$DSH_HOME/profiles/web/node_modules/dsh-quote-reply`（默认 `~/.dsh/profiles/web/node_modules/dsh-quote-reply`）；
2. 在 `$DSH_HOME/profiles/web/cordis.patch.yml` 中把 `[]` 替换为：

```yaml
- insert:
    - id: quote-reply
      name: 'dsh-quote-reply'
```

3. 重启 `dsh web`，刷新浏览器页面。

> 提示：新增插件需要重启；之后仅修改 `lib/client.js` 内容时只需刷新页面，无需重启。

### 卸载

删除 `cordis.patch.yml` 中的 `quote-reply` 条目并删除插件目录，重启即可。

## 工作原理 How it works

- 插件以 dsh `dsh.client`（`platform: web`）包形式提供，注册进 `conversation.chat.assistant-actions` 槽位；
- 浮动按钮由模块级逻辑维护：监听 `mouseup`/`selectionchange`，记录松手点，在鼠标周围按优先级生成候选位（右→右下→左→右上→上→下），用 `document.elementFromPoint` 探测每个候选位的最顶层元素，跳过被外部浮层占据的位置，兜底锚定选区末尾上方/下方；
- 引用内容通过会话标准套件 `useInput`/`inputActions` 写入输入框草稿，与官方 @/命令引用共用同一输入状态机。

## 开发 Development

无需构建步骤，`lib/client.js` 为手写的 dsh client-bundle 格式。冒烟测试（Node 直接运行，无需浏览器）：

```bash
node test/client.smoke.cjs
```

## 致谢 Credits

- 按钮图标采用 [Lucide](https://lucide.dev) 的 `quote` 图形（ISC 许可）；
- 插件按 DeepSeek Harness 官方 `dsh-client-ui-message-feedback` 插件的挂载模式编写。

## License

[MIT](./LICENSE)
