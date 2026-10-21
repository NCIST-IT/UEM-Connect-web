# uem-it.cn NixOS 运维

## 目录与环境

- `/srv/uem-it.cn/flake.nix`、`flake.lock`：构建环境和更新入口，只锁定工具依赖。
- `/srv/uem-it.cn/.envrc`：`use flake`，通过 direnv 自动加载环境。
- `/srv/uem-it.cn/source/`：网站 Git 仓库，跟踪 `main`。
- `/srv/uem-it.cn/releases/`：静态发布历史。
- `/srv/uem-it.cn/current`：Nginx 根目录，原子切换的发布符号链接。
- `/srv/uem-it.cn/logs/`：更新日志与发布提交记录。
- `/etc/nixos/modules/web/`：Nginx、网络、证书和 direnv 系统配置。

使用 `admin` 账户构建与发布，Nginx 账户只读访问发布目录。
系统安装 direnv、nix-direnv 并启用 Bash 集成。首次启用系统配置后重新登录 SSH，
然后进入目录即可自动加载 Node.js、pnpm、Python、Git 和 `uem-update`：

```sh
cd /srv/uem-it.cn
direnv allow
cd source
node --version
pnpm --version
```

旧 SSH 会话可执行 `eval "$(direnv hook bash)"` 加载 hook。

## 更新网站

```sh
cd /srv/uem-it.cn
uem-update
```

非交互 SSH 使用 Flake 入口：

```sh
ssh aws 'nix run /srv/uem-it.cn#update'
```

更新逻辑定义在 `flake.nix`：拉取 `main`，按锁文件安装依赖，依次运行 lint、构建和
测试，再原子替换 `current`。发布后校验源站 HTTPS 证书和页面内容，失败时恢复
上一发布目录。源码有本地改动或已有更新运行时停止，日志写入 `logs/`。

## 同步构建环境

仓库根目录的 Flake 与 `.envrc` 是服务器网站环境的配置来源。拉取环境配置后，
将其安装到网站目录，再运行更新入口：

```sh
cd /srv/uem-it.cn/source
git pull --ff-only origin main
install -m 0644 flake.nix flake.lock .envrc /srv/uem-it.cn/
direnv allow /srv/uem-it.cn
nix run /srv/uem-it.cn#update
```

当前 Node.js 为官方 **24.22.1 LTS** 安全版，版本和安装包 SHA-256 在 `flake.nix`
中固定；升级 Node.js 时需同时更新这两个值及 `package.json` 的 `engines.node`。
`nix flake update nixpkgs` 更新其余构建工具的锁定依赖，不会修改显式固定的 Node.js 版本。

## NixOS Web 模块

将仓库 `deploy/nixos/web/` 同步至 `/etc/nixos/modules/web/`，并在服务器主机模块中
导入该目录。主机需已有 `admin` 用户、`users` 组和 ACME 联系邮箱。

系统 Flake 添加独立的 Web 包输入，并将其传给模块：

```nix
inputs.nixpkgs-web.url = "github:NixOS/nixpkgs/nixos-26.05";

# outputs 参数中包含 nixpkgs-web，nixosSystem 的 specialArgs 中添加：
specialArgs.webPkgs = nixpkgs-web.legacyPackages.${system};
```

`web/nginx.nix` 使用 `webPkgs.nginx`。更新该输入并应用配置：

```sh
sudo nix flake update nixpkgs-web --flake /etc/nixos
sudo nixos-rebuild build --flake /etc/nixos#lightsail
next="$(readlink -f result)"
sudo "$next/sw/bin/nginx" -t -c "$next/etc/nginx/nginx.conf"
sudo nixos-rebuild switch --flake /etc/nixos#lightsail
sudo systemctl restart nginx
nginx -v
curl --fail --head https://uem-it.cn/
```

当前稳定版为 **Nginx 1.30.6**。更换包版本后重启 Nginx，确保运行进程使用新二进制。
模块启用 TCP 80/443、HTTPS 跳转、`www` 跳转、ACME 自动续期、日志轮转和安全响应头；
正式服务直接读取静态文件，更新网站无需重启 Nginx。

Cloudflare Web Analytics 的 CSP 例外仅允许 `static.cloudflareinsights.com` 脚本与
`cloudflareinsights.com` 上报，同源 `/cdn-cgi/rum` 也可使用。DNS 由域名维护者管理。

## 查看与回滚

```sh
cd /srv/uem-it.cn
readlink current
ls -1 releases
```

选择已有发布目录，用实际目录名替换下列值：

```sh
release=已有发布目录名称
test -s "releases/$release/index.html" &&
ln -s "releases/$release" ".current-$$" &&
mv -Tf ".current-$$" current
curl --fail --head https://uem-it.cn/
```

## 服务检查

```sh
systemctl status nginx
systemctl list-timers 'acme-*' '*logrotate*'
sudo nginx -t -c /etc/nginx/nginx.conf
sudo journalctl -u acme-order-renew-uem-it.cn.service -n 40 --no-pager
```
