"""HX-HouTiKu Python SDK 使用示例

运行方式:
    cd examples/py-sdk-demo
    uv run demo.py
"""

from dotenv import load_dotenv

# 从 .env 文件加载环境变量（必须在 import hx_houtiku 之前）
load_dotenv()

from hx_houtiku import HxHoutikuClient, push


def demo_quick_push():
    """方式一：快捷函数 push()，自动读取环境变量"""
    print("=" * 50)
    print("🚀 快捷函数 push()")
    print("=" * 50)

    result = push(
        "测试通知",
        "这是通过 **push()** 快捷函数发出的消息",
        priority="default",
        group="demo",
    )
    print(f"  ✅ 发送成功: {result}")


def demo_client_instance():
    """方式二：手动创建 Client 实例"""
    print("\n" + "=" * 50)
    print("🔧 手动创建 Client")
    print("=" * 50)

    import os

    client = HxHoutikuClient(
        endpoint=os.environ["HX_HOUTIKU_ENDPOINT"],
        api_token=os.environ["HX_HOUTIKU_TOKEN"],
    )

    # 查看自动获取到的接收者
    print(f"  📋 接收者列表: {[r.name for r in client.recipients]}")

    result = client.send(
        "Client 实例测试",
        "通过手动创建的 `HxHoutikuClient` 发送",
        priority="low",
        content_type="markdown",
        group="demo",
    )
    print(f"  ✅ 发送成功: {result}")
    client.close()


def demo_context_manager():
    """方式三：使用上下文管理器（推荐）"""
    print("\n" + "=" * 50)
    print("📦 上下文管理器 (with 语句)")
    print("=" * 50)

    with HxHoutikuClient.from_env() as client:
        # 刷新接收者
        recipients = client.fetch_recipients()
        print(f"  📋 活跃接收者: {[r.name for r in recipients]}")

        # 发送不同优先级的消息
        for prio in ("low", "default", "high"):
            result = client.send(
                f"优先级测试 [{prio}]",
                f"这条消息的优先级是 `{prio}`",
                priority=prio,
                group="demo",
            )
            print(f"  ✅ [{prio}] 发送成功: {result}")


def demo_content_types():
    """方式四：不同内容类型"""
    print("\n" + "=" * 50)
    print("📝 不同内容类型")
    print("=" * 50)

    with HxHoutikuClient.from_env() as client:
        # Markdown
        client.send(
            "Markdown 示例",
            "# 标题\n- 列表项 1\n- **加粗** 和 *斜体*\n\n```python\nprint('hello')\n```",
            content_type="markdown",
            group="demo",
        )
        print("  ✅ markdown 发送成功")

        # 纯文本
        client.send(
            "纯文本示例",
            "这是一段纯文本，不会解析任何格式",
            content_type="text",
            group="demo",
        )
        print("  ✅ text 发送成功")

        # HTML
        client.send(
            "HTML 示例",
            "<h2>标题</h2><p>段落 <strong>加粗</strong></p>",
            content_type="html",
            group="demo",
        )
        print("  ✅ html 发送成功")


if __name__ == "__main__":
    import sys

    demos = {
        "quick": demo_quick_push,
        "client": demo_client_instance,
        "context": demo_context_manager,
        "content": demo_content_types,
    }

    # 支持命令行参数选择运行哪个 demo
    # uv run demo.py          → 运行所有
    # uv run demo.py quick    → 只运行快捷函数示例
    selected = sys.argv[1:] or list(demos.keys())

    for name in selected:
        if name not in demos:
            print(f"❌ 未知的 demo: {name}")
            print(f"   可选: {', '.join(demos.keys())}")
            sys.exit(1)
        demos[name]()

    print("\n🎉 全部完成！")
