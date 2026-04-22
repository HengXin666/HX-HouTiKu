#!/usr/bin/env python3
"""
HX-HouTiKu 一键初始化脚本

只做初始化和密钥配置，不做部署（部署交给 GitHub Actions）。

  1. 检查工具 (npx/pnpm/wrangler/gh)
  2. 安装 Worker 依赖
  3. 创建/复用 D1 数据库
  4. 生成 wrangler.toml
  5. 初始化数据库 Schema
  6. 生成 VAPID 密钥对 + ADMIN_TOKEN
  7. 配置 Wrangler Secrets
  8. 配置 GitHub Secrets/Variables（逐个确认，不覆盖已有值）
  9. 输出机密总结表 + 备份到 .secrets.env

用法:
    cd HX-HouTiKu
    python scripts/setup.py
"""

from __future__ import annotations

import json
import os
import re
import secrets as secrets_mod
import shutil
import subprocess
import sys
from pathlib import Path

# ─── 颜色 ────────────────────────────────────────────────────

BOLD = "\033[1m"
DIM = "\033[2m"
RED = "\033[31m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
BLUE = "\033[34m"
CYAN = "\033[36m"
RESET = "\033[0m"

def info(msg: str) -> None:
    print(f"  {CYAN}>{RESET} {msg}")

def ok(msg: str) -> None:
    print(f"  {GREEN}OK{RESET} {msg}")

def warn(msg: str) -> None:
    print(f"  {YELLOW}!!{RESET} {msg}")

def err(msg: str) -> None:
    print(f"  {RED}ERR{RESET} {msg}")

def heading(num: int, msg: str) -> None:
    print(f"\n{BOLD}[{num}] {msg}{RESET}")
    print(f"{'─' * 50}")

def ask(prompt: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    val = input(f"  {YELLOW}?{RESET} {prompt}{suffix}: ").strip()
    return val or default

def confirm(prompt: str, default: bool = True) -> bool:
    hint = "Y/n" if default else "y/N"
    val = input(f"  {YELLOW}?{RESET} {prompt} ({hint}): ").strip().lower()
    if not val:
        return default
    return val in ("y", "yes")

# ─── 子进程 ──────────────────────────────────────────────────

def run(cmd: str, cwd: str | None = None, capture: bool = False, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd, cwd=cwd, capture_output=capture, text=True,
        check=check, encoding="utf-8", errors="replace", shell=True,
    )

def run_q(cmd: str, cwd: str | None = None) -> str:
    """Run and return stdout, never raise."""
    r = run(cmd, cwd=cwd, capture=True, check=False)
    return r.stdout.strip()

def pipe_stdin(cmd: str, value: str, cwd: str | None = None) -> int:
    """Run cmd, pipe value to stdin, return exit code."""
    p = subprocess.Popen(
        cmd, cwd=cwd, stdin=subprocess.PIPE,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        shell=True, text=True, encoding="utf-8", errors="replace",
    )
    p.communicate(input=value + "\n")
    return p.returncode

# ─── GitHub 辅助 ─────────────────────────────────────────────

def gh_list_secrets() -> set[str]:
    out = run_q("gh secret list")
    return {line.split("\t")[0] for line in out.splitlines() if "\t" in line}

def gh_list_variables() -> dict[str, str]:
    out = run_q("gh variable list")
    result = {}
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) >= 2:
            result[parts[0]] = parts[1]
    return result

def gh_set_secret(name: str, value: str) -> bool:
    return pipe_stdin(f"gh secret set {name}", value) == 0

def gh_set_variable(name: str, value: str) -> bool:
    r = run(f'gh variable set {name} --body "{value}"', capture=True, check=False)
    return r.returncode == 0

# ─── 主流程 ──────────────────────────────────────────────────

def main() -> None:
    print(f"""
{BOLD}  HX-HouTiKu 初始化配置{RESET}
{DIM}  只做初始化和密钥，不做部署{RESET}
""")

    root = Path(__file__).resolve().parent.parent
    worker_dir = root / "worker"

    if not (worker_dir / "package.json").exists():
        err("找不到 worker/package.json，请在项目根目录运行")
        sys.exit(1)

    os.chdir(root)

    # ═══════════════════════════════════════════════════════════
    heading(0, "检查工具")

    for tool in ("npx", "pnpm"):
        if not shutil.which(tool):
            err(f"找不到 {tool}")
            sys.exit(1)
        ok(f"{tool}")

    # gh — 纯本地检测，不联网
    has_gh = bool(shutil.which("gh"))
    if has_gh:
        # 检查 ~/.config/gh/hosts.yml 是否存在（gh 登录后会写这个文件）
        gh_hosts = Path.home() / ".config" / "gh" / "hosts.yml"
        gh_hosts_win = Path(os.environ.get("APPDATA", "")) / "GitHub CLI" / "hosts.yml"
        if gh_hosts.exists() or gh_hosts_win.exists():
            ok("gh CLI 可用")
        else:
            has_gh = False
            warn("gh CLI 未登录，跳过 GitHub 配置")
    else:
        warn("未找到 gh CLI，跳过 GitHub 配置")

    # wrangler 登录状态放到真正用的时候再检查（避免这里卡住）
    ok("工具检查完成")

    # ═══════════════════════════════════════════════════════════
    heading(1, "安装 Worker 依赖")
    run("pnpm install", cwd=str(worker_dir))
    ok("完成")

    # ═══════════════════════════════════════════════════════════
    heading(2, "D1 数据库")

    wrangler_toml = worker_dir / "wrangler.toml"
    db_id = None

    # 检查现有 toml
    if wrangler_toml.exists():
        m = re.search(r'database_id\s*=\s*"([^"]+)"', wrangler_toml.read_text("utf-8"))
        if m and m.group(1) != "your-database-id-here":
            db_id = m.group(1)
            ok(f"已有: {db_id}")

    if not db_id:
        info("创建 D1 数据库...")
        out = run_q("npx wrangler d1 create hx-houtiku", cwd=str(worker_dir))
        m = re.search(r'database_id\s*=\s*"([^"]+)"', out)
        if m:
            db_id = m.group(1)
        else:
            # 可能已存在，尝试 list
            list_out = run_q("npx wrangler d1 list --json", cwd=str(worker_dir))
            try:
                for db in json.loads(list_out):
                    if db.get("name") == "hx-houtiku":
                        db_id = db["uuid"]
            except Exception:
                pass
        if not db_id:
            err(f"获取数据库 ID 失败:\n{out}")
            sys.exit(1)
        ok(f"数据库 ID: {db_id}")

    # ═══════════════════════════════════════════════════════════
    heading(3, "生成 wrangler.toml")

    api_domain = ask("后端 API 域名", "houtiku.api.woa.qzz.io")

    toml = f'''name = "hx-houtiku-api"
main = "src/index.ts"
compatibility_date = "2024-12-01"

[triggers]
crons = ["0 2 * * *"]

[[d1_databases]]
binding = "DB"
database_name = "hx-houtiku"
database_id = "{db_id}"

[durable_objects]
bindings = [
  {{ name = "MESSAGE_RELAY", class_name = "MessageRelay" }}
]

[[migrations]]
tag = "v1"
new_sqlite_classes = ["MessageRelay"]

[vars]
ENCRYPTION_CURVE = "secp256k1"

routes = [
  {{ pattern = "{api_domain}", custom_domain = true }}
]
'''
    wrangler_toml.write_text(toml, encoding="utf-8")
    ok(f"已写入 (域名: {api_domain})")

    # ═══════════════════════════════════════════════════════════
    heading(4, "初始化 Schema")

    schema = worker_dir / "schema.sql"
    r = run(
        f"npx wrangler d1 execute hx-houtiku --remote --file={schema.name}",
        cwd=str(worker_dir), capture=True, check=False,
    )
    if r.returncode == 0:
        ok("Schema 执行完成")
    elif "already exists" in (r.stdout + r.stderr).lower():
        ok("表已存在，跳过")
    else:
        warn(f"Schema 可能有问题: {(r.stderr or r.stdout)[:200]}")

    # ═══════════════════════════════════════════════════════════
    heading(5, "生成密钥")

    # VAPID
    info("生成 VAPID 密钥对...")
    vapid_out = run_q("npx web-push generate-vapid-keys", cwd=str(worker_dir))
    vapid_pub = vapid_priv = ""
    lines = vapid_out.splitlines()
    for i, line in enumerate(lines):
        if "Public Key" in line and i + 1 < len(lines):
            vapid_pub = lines[i + 1].strip()
        if "Private Key" in line and i + 1 < len(lines):
            vapid_priv = lines[i + 1].strip()

    if not vapid_pub or not vapid_priv:
        err(f"VAPID 生成失败:\n{vapid_out}")
        sys.exit(1)
    ok(f"VAPID 公钥: {vapid_pub[:30]}...")
    ok(f"VAPID 私钥: {vapid_priv[:15]}...")

    # ADMIN_TOKEN
    admin_token = f"sk-hx-houtiku-{secrets_mod.token_hex(16)}"
    ok(f"ADMIN_TOKEN: {admin_token}")

    # ═══════════════════════════════════════════════════════════
    heading(6, "配置 Wrangler Secrets")

    w_secrets = {
        "ADMIN_TOKEN": admin_token,
        "VAPID_PUBLIC_KEY": vapid_pub,
        "VAPID_PRIVATE_KEY": vapid_priv,
    }
    for name, value in w_secrets.items():
        info(f"{name} ...")
        rc = pipe_stdin(f"npx wrangler secret put {name}", value, cwd=str(worker_dir))
        if rc == 0:
            ok(f"{name}")
        else:
            warn(f"{name} 可能失败，手动: npx wrangler secret put {name}")

    # ═══════════════════════════════════════════════════════════
    # GitHub Secrets / Variables
    api_url = f"https://{api_domain}"
    frontend_domain = ask("前端域名", "houtiku.woa.qzz.io")
    frontend_url = f"https://{frontend_domain}"

    # 写前端 .env.production
    env_prod = root / "frontend" / ".env.production"
    env_prod.write_text(f"VITE_API_BASE={api_url}\n", encoding="utf-8")
    ok(f"已写入 frontend/.env.production")

    if has_gh:
        heading(7, "GitHub Secrets & Variables")

        existing_secrets = gh_list_secrets()
        existing_vars = gh_list_variables()

        info(f"仓库已有 {len(existing_secrets)} 个 Secrets, {len(existing_vars)} 个 Variables")
        print()

        # ── 需要设置的 Secrets ──
        # 规则: 如果已存在，问用户是否覆盖；不存在则直接设置
        want_secrets = {
            "ADMIN_TOKEN": admin_token,
            # CLOUDFLARE_API_TOKEN 和 CLOUDFLARE_ACCOUNT_ID 用户已经配过，绝不主动覆盖
        }

        for name, value in want_secrets.items():
            if name in existing_secrets:
                warn(f"GitHub Secret '{name}' 已存在")
                if confirm(f"  覆盖为新生成的值?", default=False):
                    if gh_set_secret(name, value):
                        ok(f"  {name} 已更新")
                    else:
                        warn(f"  {name} 更新失败")
                else:
                    info(f"  跳过 {name}，保留原值")
            else:
                if gh_set_secret(name, value):
                    ok(f"  {name} 已设置")
                else:
                    warn(f"  {name} 设置失败")

        # 列出我们不会碰的 Secrets
        protected = {"CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID",
                      "GOOGLE_SERVICES_JSON", "ANDROID_KEYSTORE_BASE64",
                      "ANDROID_KEYSTORE_PASSWORD", "ANDROID_KEY_ALIAS",
                      "ANDROID_KEY_PASSWORD"}
        existing_protected = existing_secrets & protected
        if existing_protected:
            print()
            info(f"以下 Secrets 已存在，{BOLD}不会修改{RESET}:")
            for s in sorted(existing_protected):
                print(f"    {DIM}- {s}{RESET}")

        # ── Variables ──
        print()
        want_vars = {
            "VITE_API_BASE": api_url,
            "ANDROID_FRONTEND_URL": frontend_url,
        }

        for name, value in want_vars.items():
            old = existing_vars.get(name)
            if old:
                if old == value:
                    ok(f"  {name} = {value} (已是最新)")
                    continue
                warn(f"  Variable '{name}' 当前值: {old}")
                info(f"  新值: {value}")
                if confirm(f"  更新?", default=True):
                    if gh_set_variable(name, value):
                        ok(f"  {name} 已更新")
                    else:
                        warn(f"  {name} 更新失败")
                else:
                    info(f"  跳过")
            else:
                if gh_set_variable(name, value):
                    ok(f"  {name} = {value}")
                else:
                    warn(f"  {name} 设置失败")

    # ═══════════════════════════════════════════════════════════
    step = 8 if has_gh else 7
    heading(step, "机密总结")

    col1 = 22
    col2 = 50

    def row(k: str, v: str) -> None:
        # 长值换行
        if len(v) > col2:
            print(f"  {k:<{col1}} {v[:col2]}")
            print(f"  {'':<{col1}} {v[col2:]}")
        else:
            print(f"  {k:<{col1}} {v}")

    print(f"\n{BOLD}  Wrangler Secrets (已配置到 Cloudflare){RESET}")
    print(f"  {'─' * (col1 + col2 + 1)}")
    row("ADMIN_TOKEN", admin_token)
    row("VAPID_PUBLIC_KEY", vapid_pub)
    row("VAPID_PRIVATE_KEY", vapid_priv)

    print(f"\n{BOLD}  URL{RESET}")
    print(f"  {'─' * (col1 + col2 + 1)}")
    row("后端 API", api_url)
    row("前端 Pages", frontend_url)

    print(f"\n{BOLD}  D1 数据库{RESET}")
    print(f"  {'─' * (col1 + col2 + 1)}")
    row("database_id", db_id)

    print(f"\n{BOLD}  SDK 环境变量 (推送脚本用){RESET}")
    print(f"  {'─' * (col1 + col2 + 1)}")
    row("HX_HOUTIKU_ENDPOINT", api_url)
    row("HX_HOUTIKU_TOKEN", admin_token)

    # 写入 .secrets.env
    secrets_file = root / ".secrets.env"
    secrets_file.write_text(
        f"# HX-HouTiKu 机密 (setup.py 生成, 已在 .gitignore)\n"
        f"ADMIN_TOKEN={admin_token}\n"
        f"VAPID_PUBLIC_KEY={vapid_pub}\n"
        f"VAPID_PRIVATE_KEY={vapid_priv}\n"
        f"D1_DATABASE_ID={db_id}\n"
        f"\n# SDK\n"
        f"HX_HOUTIKU_ENDPOINT={api_url}\n"
        f"HX_HOUTIKU_TOKEN={admin_token}\n"
        f"\n# URL\n"
        f"API_URL={api_url}\n"
        f"FRONTEND_URL={frontend_url}\n",
        encoding="utf-8",
    )

    # .gitignore
    gi = root / ".gitignore"
    if gi.exists() and ".secrets.env" not in gi.read_text("utf-8"):
        with open(gi, "a", encoding="utf-8") as f:
            f.write("\n.secrets.env\n")

    print(f"\n  {GREEN}已备份到 .secrets.env{RESET}")
    print(f"\n{BOLD}  完成!{RESET} 推代码到 main 分支, GitHub Actions 会自动部署。\n")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n  {YELLOW}已取消{RESET}")
        sys.exit(130)
    except subprocess.CalledProcessError as e:
        err(f"命令失败: {e.cmd}")
        sys.exit(1)
