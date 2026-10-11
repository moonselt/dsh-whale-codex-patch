$ErrorActionPreference = 'Stop'
$workspace = 'D:\用户\Documents\deepseek-harness\default-workspace\codex-whale'
$target = 'C:\Users\15593\.dsh\profiles\desktop\node_modules\dsh-whale-widget'
$resolved = (Resolve-Path -LiteralPath $target).Path
if ($resolved -ne $target) { throw '插件目标路径不匹配，停止安装' }
foreach ($relative in @('lib\index.js', 'assets\whale-widget.js')) {
  $live = Join-Path $target $relative
  $original = Join-Path "$workspace\original" $relative
  if ((Get-FileHash -LiteralPath $live -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $original -Algorithm SHA256).Hash) {
    throw "插件已发生变化，停止覆盖：$relative"
  }
}
$newModule = Join-Path $target 'lib\codex-subscription.mjs'
if (Test-Path -LiteralPath $newModule) { throw '目标目录已有同名模块，停止覆盖' }
foreach ($relative in @('lib\codex-subscription.mjs','lib\index.js','assets\whale-widget.js')) {
  $source = Join-Path "$workspace\plugin" $relative
  $destination = Join-Path $target $relative
  Copy-Item -LiteralPath $source -Destination $destination -Force
  if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash) {
    throw "安装后校验失败：$relative"
  }
  Write-Output "已安装并校验：$relative"
}
Write-Output '插件补丁安装完成；未修改用户账本或账号凭据。重启 DSH 后加载后端改动。'
