export function createShortcutSource(
  bundle,
  { addUniversitySuffix = false } = {},
) {
  return `// 应大通 Safari 课表导出（试验）\n// 在已登录的学校课表页面，通过 Safari 分享菜单运行。\n// 不读取 Cookie，不向应大通服务器发送课表或凭据。\n(function () {\n  const UEM_SHORTCUT_OPTIONS = ${JSON.stringify({ addUniversitySuffix: addUniversitySuffix === true })};\n${bundle}\n})();\n`;
}
