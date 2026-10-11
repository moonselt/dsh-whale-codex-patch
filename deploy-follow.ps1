$ErrorActionPreference = 'Stop'
$workspace = 'D:\用户\Documents\deepseek-harness\default-workspace\codex-whale'
$target = 'C:\Users\15593\.dsh\profiles\desktop\node_modules\dsh-whale-widget'
$resolved = (Resolve-Path -LiteralPath $target).Path
if ($resolved -ne $target) { throw '插件目标路径不匹配，停止安装' }
foreach ($relative in @('package.json', 'assets\whale-widget.js')) {
  $live = Join-Path $target $relative
  $baseline = Join-Path "$workspace\before-follow" $relative
  if ((Get-FileHash -LiteralPath $live -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $baseline -Algorithm SHA256).Hash) {
    throw "插件已发生变化，停止覆盖：$relative"
  }
}
if (Test-Path -LiteralPath (Join-Path $target 'lib\client.js')) { throw '目标插件已有客户端模块，停止覆盖' }
# Install the module first and publish its manifest last.
foreach ($relative in @('lib\client.js','assets\whale-widget.js','package.json')) {
  $source = Join-Path "$workspace\plugin" $relative
  $destination = Join-Path $target $relative
  Copy-Item -LiteralPath $source -Destination $destination -Force
  if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash) {
    throw "安装后校验失败：$relative"
  }
  Write-Output "已安装并校验：$relative"
}
Write-Output '自动跟随补丁安装完成。未修改账本、气泡配置、凭据或 dsh-codex-subscription。重启 DSH 后加载客户端模块。'
