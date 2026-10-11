$ErrorActionPreference = 'Stop'
$workspace = 'D:\用户\Documents\deepseek-harness\default-workspace\codex-whale'
$target = 'C:\Users\15593\.dsh\profiles\desktop\node_modules\dsh-whale-widget\assets\whale-widget.js'
if ((Resolve-Path -LiteralPath $target).Path -ne $target) { throw '安装目标不匹配，停止' }
$baseline = Join-Path $workspace 'before-layout\assets\whale-widget.js'
$source = Join-Path $workspace 'plugin\assets\whale-widget.js'
if ((Get-FileHash -LiteralPath $target).Hash -ne (Get-FileHash -LiteralPath $baseline).Hash) { throw '当前插件已变化，停止覆盖' }
Copy-Item -LiteralPath $source -Destination $target -Force
if ((Get-FileHash -LiteralPath $target).Hash -ne (Get-FileHash -LiteralPath $source).Hash) { throw '安装后校验失败' }
Write-Output '紧凑气泡已安装并通过哈希校验；复用原生 plan 模块，不改配置、账本、凭据或 Codex 订阅插件。刷新 DSH 页面后生效。'
