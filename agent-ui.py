"""
使用 pywinauto 打开微信，截屏并保存到当前文件夹。
若未找到微信，请设置环境变量 WECHAT_EXE 为 WeChat.exe 的完整路径。
"""
import os
import time
from pywinauto import Application

# 截图保存路径（当前脚本所在目录）
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
SCREENSHOT_PATH = os.path.join(CURRENT_DIR, "wechat_screenshot.png")

os.environ["WECHAT_EXE"] = r"C:\Users\15727\AppData\Roaming\Tencent\xwechat\xplugin\plugins\RadiumWMPF\18955\extracted\runtime\WeChatAppEx.exe"

def find_wechat_exe():
    """在常见安装位置查找 WeChat.exe，或从环境变量 WECHAT_EXE 读取。"""
    env_path = os.environ.get("WECHAT_EXE", "").strip()
    if env_path and os.path.isfile(env_path):
        return env_path
    roots = [
        os.environ.get("ProgramFiles", "C:\\Program Files"),
        os.environ.get("ProgramFiles(x86)", "C:\\Program Files (x86)"),
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Tencent"),
    ]
    for root in roots:
        if not root:
            continue
        for sub in ("Tencent\\WeChat", "WeChat", ""):
            path = os.path.join(root, sub, "WeChat.exe") if sub else os.path.join(root, "WeChat.exe")
            if os.path.isfile(path):
                return path
    return None


def main():
    wechat_exe = find_wechat_exe()
    if not wechat_exe:
        print("未找到微信 (WeChat.exe)。请任选其一：")
        print("  1. 安装微信后重试")
        print("  2. 设置环境变量 WECHAT_EXE 为微信安装路径，例如：")
        print('     set WECHAT_EXE=C:\\Program Files\\Tencent\\WeChat\\WeChat.exe')
        raise SystemExit(1)

    # 若微信已在运行，则连接现有进程并截屏，否则启动新进程
    try:
        app = Application(backend="uia").connect(path=wechat_exe, timeout=2)
    except Exception:
        app = Application(backend="uia").start(wechat_exe)

    # 等待微信主窗口出现（标题通常包含 "微信" 或 "WeChat"）
    time.sleep(3)
    win = app.window(title_re=".*微信|.*WeChat.*")
    print(win)
    win.print_ctrl_ids()
    win.wait("ready", timeout=20)

    # 将窗口置前以便截屏
    win.set_focus()
    time.sleep(0.5)

    # 截取窗口图像并保存
    image = win.capture_as_image()
    image.save(SCREENSHOT_PATH)
    print("截图已保存到:", SCREENSHOT_PATH)


if __name__ == "__main__":
    main()
