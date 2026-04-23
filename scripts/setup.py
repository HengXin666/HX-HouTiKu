#!/usr/bin/env python3
"""
HX-HouTiKu 初始化 & 配置脚本

首次运行: 全量初始化向导
再次运行: 显示当前配置 → 交互式菜单，按需修改

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

def heading(msg: str) -> None:
    print(f"\n{BOLD}  {msg}{RESET}")
    print(f"  {'─' * 48}")

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
    r = run(cmd, cwd=cwd, capture=True, check=False)
    return r.stdout.strip()

def pipe_stdin(cmd: str, value: str, cwd: str | None = None) -> int:
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

# ─── .env 读写 ───────────────────────────────────────────────

def load_env(path: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    if not path.exists():
        return result
    for line in path.read_text("utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, _, v = line.partition("=")
            result[k.strip()] = v.strip()
    return result

def save_env(path: Path, cfg: dict[str, str]) -> None:
    path.write_text(
        f"# HX-HouTiKu 机密 (setup.py 生成, 已在 .gitignore)\n"
        f"ADMIN_TOKEN={cfg.get('ADMIN_TOKEN', '')}\n"
        f"VAPID_PUBLIC_KEY={cfg.get('VAPID_PUBLIC_KEY', '')}\n"
        f"VAPID_PRIVATE_KEY={cfg.get('VAPID_PRIVATE_KEY', '')}\n"
        f"D1_DATABASE_ID={cfg.get('D1_DATABASE_ID', '')}\n"
        f"\n# SDK\n"
        f"HX_HOUTIKU_ENDPOINT={cfg.get('API_URL', '')}\n"
        f"HX_HOUTIKU_TOKEN={cfg.get('ADMIN_TOKEN', '')}\n"
        f"\n# URL\n"
        f"API_URL={cfg.get('API_URL', '')}\n"
        f"FRONTEND_URL={cfg.get('FRONTEND_URL', '')}\n",
        encoding="utf-8",
    )

# ─── 工具检查 ────────────────────────────────────────────────

def check_tools() -> bool:
    for tool in ("npx", "pnpm"):
        if not shutil.which(tool):
            err(f"找不到 {tool}")
            return False
    return True

def check_gh() -> bool:
    if not shutil.which("gh"):
        return False
    gh_hosts = Path.home() / ".config" / "gh" / "hosts.yml"
    gh_hosts_win = Path(os.environ.get("APPDATA", "")) / "GitHub CLI" / "hosts.yml"
    return gh_hosts.exists() or gh_hosts_win.exists()

# ─── 各步骤函数 ──────────────────────────────────────────────

def step_install_deps(worker_dir: Path) -> None:
    heading("安装 Worker 依赖")
    run("pnpm install", cwd=str(worker_dir))
    ok("完成")

def step_create_db(worker_dir: Path) -> str | None:
    heading("创建/查找 D1 数据库")
    wrangler_toml = worker_dir / "wrangler.toml"
    db_id = None

    if wrangler_toml.exists():
        m = re.search(r'database_id\s*=\s*"([^"]+)"', wrangler_toml.read_text("utf-8"))
        if m and m.group(1) != "your-database-id-here":
            db_id = m.group(1)
            ok(f"已有: {db_id}")
            return db_id

    info("创建 D1 数据库...")
    out = run_q("npx wrangler d1 create hx-houtiku", cwd=str(worker_dir))
    m = re.search(r'database_id\s*=\s*"([^"]+)"', out)
    if m:
        db_id = m.group(1)
    else:
        list_out = run_q("npx wrangler d1 list --json", cwd=str(worker_dir))
        try:
            for db in json.loads(list_out):
                if db.get("name") == "hx-houtiku":
                    db_id = db["uuid"]
        except Exception:
            pass
    if not db_id:
        err(f"获取数据库 ID 失败:\n{out}")
        return None
    ok(f"数据库 ID: {db_id}")
    return db_id

def step_write_wrangler(worker_dir: Path, db_id: str, api_domain: str) -> None:
    heading("生成 wrangler.toml")
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
    (worker_dir / "wrangler.toml").write_text(toml, encoding="utf-8")
    ok(f"已写入 (域名: {api_domain})")

def step_init_schema(worker_dir: Path) -> None:
    heading("初始化 D1 Schema")
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

def step_gen_keys(worker_dir: Path) -> tuple[str, str, str] | None:
    heading("生成密钥")
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
        return None
    ok(f"VAPID 公钥: {vapid_pub[:30]}...")
    admin_token = f"sk-hx-houtiku-{secrets_mod.token_hex(16)}"
    ok(f"ADMIN_TOKEN: {admin_token}")
    return vapid_pub, vapid_priv, admin_token

def step_wrangler_secrets(worker_dir: Path, cfg: dict[str, str]) -> None:
    heading("配置 Wrangler Secrets")
    for name in ("ADMIN_TOKEN", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"):
        value = cfg.get(name, "")
        if not value:
            warn(f"{name} 为空，跳过")
            continue
        info(f"{name} ...")
        rc = pipe_stdin(f"npx wrangler secret put {name}", value, cwd=str(worker_dir))
        if rc == 0:
            ok(f"{name}")
        else:
            warn(f"{name} 可能失败，手动: npx wrangler secret put {name}")

def step_github(cfg: dict[str, str]) -> None:
    heading("GitHub Secrets & Variables")
    existing_secrets = gh_list_secrets()
    existing_vars = gh_list_variables()
    info(f"仓库已有 {len(existing_secrets)} 个 Secrets, {len(existing_vars)} 个 Variables")
    print()

    want_secrets = {"ADMIN_TOKEN": cfg.get("ADMIN_TOKEN", "")}
    for name, value in want_secrets.items():
        if not value:
            continue
        if name in existing_secrets:
            warn(f"GitHub Secret '{name}' 已存在")
            if confirm(f"  覆盖为新值?", default=False):
                if gh_set_secret(name, value):
                    ok(f"  {name} 已更新")
                else:
                    warn(f"  {name} 更新失败")
            else:
                info(f"  跳过 {name}")
        else:
            if gh_set_secret(name, value):
                ok(f"  {name} 已设置")
            else:
                warn(f"  {name} 设置失败")

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

    print()
    want_vars = {
        "VITE_API_BASE": cfg.get("API_URL", ""),
        "ANDROID_FRONTEND_URL": cfg.get("FRONTEND_URL", ""),
    }
    for name, value in want_vars.items():
        if not value:
            continue
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

# ─── 显示当前配置 ────────────────────────────────────────────

def show_current_config(cfg: dict[str, str]) -> None:
    heading("当前配置")
    col1, col2 = 22, 50
    def row(k: str, v: str) -> None:
        v = v or f"{DIM}(未设置){RESET}"
        if len(v) > col2:
            print(f"  {k:<{col1}} {v[:col2]}")
            print(f"  {'':<{col1}} {v[col2:]}")
        else:
            print(f"  {k:<{col1}} {v}")

    row("后端 API", cfg.get("API_URL", ""))
    row("前端 Pages", cfg.get("FRONTEND_URL", ""))
    row("D1 数据库 ID", cfg.get("D1_DATABASE_ID", ""))
    row("ADMIN_TOKEN", cfg.get("ADMIN_TOKEN", ""))
    row("VAPID_PUBLIC_KEY", cfg.get("VAPID_PUBLIC_KEY", ""))
    row("VAPID_PRIVATE_KEY", cfg.get("VAPID_PRIVATE_KEY", ""))

# ─── 交互式菜单 ──────────────────────────────────────────────

MENU_ITEMS = [
    ("1", "修改后端 API 域名"),
    ("2", "修改前端域名"),
    ("3", "重新生成密钥 (VAPID + ADMIN_TOKEN)"),
    ("4", "安装 Worker 依赖 (pnpm install)"),
    ("5", "重新生成 wrangler.toml"),
    ("6", "初始化 D1 Schema"),
    ("7", "上传 Wrangler Secrets"),
    ("8", "同步 GitHub Secrets/Variables"),
    ("a", "全量重新初始化"),
    ("q", "退出"),
]

def show_menu() -> str:
    print()
    print(f"  {BOLD}选择操作:{RESET}")
    for key, label in MENU_ITEMS:
        print(f"    {CYAN}{key}{RESET}  {label}")
    print()
    return input(f"  {YELLOW}>{RESET} 输入选项: ").strip().lower()

# ─── 全量初始化 ──────────────────────────────────────────────

def full_init(root: Path, worker_dir: Path, cfg: dict[str, str], has_gh: bool) -> dict[str, str]:
    """首次运行或选 'a' 时的全量初始化。"""
    if not check_tools():
        sys.exit(1)

    # 1. 安装依赖
    step_install_deps(worker_dir)

    # 2. D1 数据库
    db_id = cfg.get("D1_DATABASE_ID") or step_create_db(worker_dir)
    if not db_id:
        sys.exit(1)
    cfg["D1_DATABASE_ID"] = db_id

    # 3. 域名
    heading("配置域名")
    api_domain = ask("后端 API 域名", _domain_from_url(cfg.get("API_URL", "")) or "houtiku-api.woa.qzz.io")
    frontend_domain = ask("前端域名", _domain_from_url(cfg.get("FRONTEND_URL", "")) or "houtiku.woa.qzz.io")
    cfg["API_URL"] = f"https://{api_domain}"
    cfg["FRONTEND_URL"] = f"https://{frontend_domain}"

    # 4. wrangler.toml
    step_write_wrangler(worker_dir, db_id, api_domain)

    # 5. Schema
    step_init_schema(worker_dir)

    # 6. 密钥
    keys = step_gen_keys(worker_dir)
    if not keys:
        sys.exit(1)
    cfg["VAPID_PUBLIC_KEY"], cfg["VAPID_PRIVATE_KEY"], cfg["ADMIN_TOKEN"] = keys

    # 7. Wrangler Secrets
    step_wrangler_secrets(worker_dir, cfg)

    # 8. 前端 .env.production
    (root / "frontend" / ".env.production").write_text(
        f"VITE_API_BASE={cfg['API_URL']}\n", encoding="utf-8",
    )
    ok("已写入 frontend/.env.production")

    # 9. GitHub
    if has_gh:
        step_github(cfg)

    return cfg

# ─── 工具函数 ────────────────────────────────────────────────

def _domain_from_url(url: str) -> str:
    return url.removeprefix("https://").removeprefix("http://").rstrip("/")

def _ensure_gitignore(root: Path) -> None:
    gi = root / ".gitignore"
    if gi.exists() and ".secrets.env" not in gi.read_text("utf-8"):
        with open(gi, "a", encoding="utf-8") as f:
            f.write("\n.secrets.env\n")

# ─── 主流程 ──────────────────────────────────────────────────

def main() -> None:
    print(f"""
{BOLD}  HX-HouTiKu 初始化 & 配置{RESET}
{DIM}  只做初始化和密钥，不做部署{RESET}
""")

    root = Path(__file__).resolve().parent.parent
    worker_dir = root / "worker"

    if not (worker_dir / "package.json").exists():
        err("找不到 worker/package.json，请在项目根目录运行")
        sys.exit(1)

    os.chdir(root)

    secrets_file = root / ".secrets.env"
    cfg = load_env(secrets_file)
    has_gh = check_gh()

    # ── 首次运行：没有配置文件 → 全量初始化 ──
    is_first_run = not cfg
    if is_first_run:
        info("首次运行，进入全量初始化向导...")
        cfg = full_init(root, worker_dir, cfg, has_gh)
        save_env(secrets_file, cfg)
        _ensure_gitignore(root)
        show_current_config(cfg)
        print(f"\n  {GREEN}已备份到 .secrets.env{RESET}")
        print(f"\n{BOLD}  完成!{RESET} 推代码到 main 分支, GitHub Actions 会自动部署。\n")
        return

    # ── 已有配置 → 显示当前状态 + 交互菜单 ──
    show_current_config(cfg)

    while True:
        choice = show_menu()

        if choice == "q":
            print(f"\n  {GREEN}再见!{RESET}\n")
            break

        elif choice == "1":
            heading("修改后端 API 域名")
            old = _domain_from_url(cfg.get("API_URL", ""))
            new_domain = ask("后端 API 域名", old)
            cfg["API_URL"] = f"https://{new_domain}"
            ok(f"已更新: {cfg['API_URL']}")
            # 联动更新 wrangler.toml 和 frontend/.env.production
            db_id = cfg.get("D1_DATABASE_ID", "")
            if db_id:
                step_write_wrangler(worker_dir, db_id, new_domain)
            (root / "frontend" / ".env.production").write_text(
                f"VITE_API_BASE={cfg['API_URL']}\n", encoding="utf-8",
            )
            ok("已同步 frontend/.env.production")

        elif choice == "2":
            heading("修改前端域名")
            old = _domain_from_url(cfg.get("FRONTEND_URL", ""))
            new_domain = ask("前端域名", old)
            cfg["FRONTEND_URL"] = f"https://{new_domain}"
            ok(f"已更新: {cfg['FRONTEND_URL']}")

        elif choice == "3":
            keys = step_gen_keys(worker_dir)
            if keys:
                cfg["VAPID_PUBLIC_KEY"], cfg["VAPID_PRIVATE_KEY"], cfg["ADMIN_TOKEN"] = keys
                ok("密钥已更新")

        elif choice == "4":
            step_install_deps(worker_dir)

        elif choice == "5":
            db_id = cfg.get("D1_DATABASE_ID", "")
            if not db_id:
                warn("没有 D1_DATABASE_ID，需要先创建数据库")
                db_id = step_create_db(worker_dir)
                if db_id:
                    cfg["D1_DATABASE_ID"] = db_id
            if db_id:
                domain = _domain_from_url(cfg.get("API_URL", "")) or "houtiku.api.woa.qzz.io"
                step_write_wrangler(worker_dir, db_id, domain)

        elif choice == "6":
            step_init_schema(worker_dir)

        elif choice == "7":
            step_wrangler_secrets(worker_dir, cfg)

        elif choice == "8":
            if has_gh:
                step_github(cfg)
            else:
                warn("gh CLI 不可用或未登录")

        elif choice == "a":
            if confirm("确定要全量重新初始化?"):
                cfg = full_init(root, worker_dir, cfg, has_gh)

        else:
            warn("无效选项，请重新输入")
            continue

        # 每次操作后保存配置
        save_env(secrets_file, cfg)
        _ensure_gitignore(root)
        print(f"\n  {DIM}已保存到 .secrets.env{RESET}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n  {YELLOW}已取消{RESET}")
        sys.exit(130)
    except subprocess.CalledProcessError as e:
        err(f"命令失败: {e.cmd}")
        sys.exit(1)
