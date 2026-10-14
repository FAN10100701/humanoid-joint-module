# -*- coding: utf-8 -*-
"""SerialLab 本地收件箱 —— 让 AI Agent 直接读到串口现场数据。

职责：起一个极小的 HTTP 服务，接收网页端串口调试助手 POST 上来的调试包，
按时间落盘成「AI 直接可读」的文件。仅用 Python 标准库，无需 pip 安装任何东西。

用法：
    python _本地工具/serial-inbox.py                 # 监听 127.0.0.1:7788，落盘到 _本地工具/serial-inbox/
    python _本地工具/serial-inbox.py --port 8899     # 换端口（网页端「端口」也要改成一致）
    python _本地工具/serial-inbox.py --once          # 只收一笔就退出（配合单轮脚本很好用）
    python _本地工具/serial-inbox.py --list          # 只列出已收到的记录，不起服务

落盘产物（都在 --dir 下）：
    latest.json        最近一笔完整调试包（AI 首选读这个）
    latest.brief.txt   最近一笔的纯文本摘要（最省 token，先读它再决定要不要读 JSON）
    stream.ndjson      追加流：每行一笔，便于看趋势 / 多轮迭代历史
    recv/<时刻>-<序号>.json   逐笔留档（多轮迭代时可直接 diff 两轮）
    status.json        计数与最近时刻（GET /status 也返回同一份）

网页端怎么用：串口调试助手 → 显示 → 「HTTP 上报本地收件箱」勾上，端口保持一致。
"""

import argparse
import json
import os
import sys
import threading
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Windows 控制台默认 cp936，直接 print 中文可能炸；能改就改成 utf-8
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DIR = os.path.join(HERE, "serial-inbox")

STATE = {"count": 0, "lastAt": 0.0, "lastSeq": None, "lastKind": "", "bytes": 0}
LOCK = threading.Lock()


def now_iso():
    return datetime.now().strftime("%Y-%m-%dT%H:%M:%S")


def stamp():
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def ensure_dir(path):
    if not os.path.isdir(path):
        os.makedirs(path)
    return path


def write_text(path, text):
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def append_text(path, text):
    with open(path, "a", encoding="utf-8", newline="\n") as f:
        f.write(text)


def save_payload(payload, out_dir):
    """把一笔调试包落盘。返回落盘后的信息字典。"""
    ensure_dir(out_dir)
    ensure_dir(os.path.join(out_dir, "recv"))

    body = json.dumps(payload, ensure_ascii=False, indent=2)
    brief = payload.get("brief") or ""
    seq = payload.get("seq")
    kind = payload.get("kind") or "unknown"

    write_text(os.path.join(out_dir, "latest.json"), body)
    if brief:
        write_text(os.path.join(out_dir, "latest.brief.txt"), brief)

    # 追加流：一行一笔。brief 单独放，避免 ndjson 每行都背上长文本
    line = json.dumps(
        {"seq": seq, "iso": payload.get("iso"), "tWall": payload.get("tWall"), "kind": kind},
        ensure_ascii=False,
    )
    append_text(os.path.join(out_dir, "stream.ndjson"), line + "\n")

    # 逐笔留档：多轮迭代时可直接 diff 两轮
    name = "%s-%s.json" % (stamp(), seq if seq is not None else "x")
    write_text(os.path.join(out_dir, "recv", name), body)

    with LOCK:
        STATE["count"] += 1
        STATE["lastAt"] = time.time()
        STATE["lastSeq"] = seq
        STATE["lastKind"] = kind
        STATE["bytes"] = len(body.encode("utf-8"))
        status = dict(STATE)
        status["lastAtIso"] = now_iso()
        status["dir"] = out_dir
    write_text(os.path.join(out_dir, "status.json"), json.dumps(status, ensure_ascii=False, indent=2))
    return {"name": name, "brief": brief, "status": status}


class Handler(BaseHTTPRequestHandler):
    server_version = "SerialLabInbox/1.0"
    out_dir = DEFAULT_DIR
    once = False
    quiet = False

    # ---------- 基础 ----------
    def log_message(self, fmt, *args):
        if not self.quiet:
            sys.stderr.write("[inbox] " + (fmt % args) + "\n")

    def _cors(self):
        """跨域 + 私有网络访问许可。

        网页端若部署在 https 站点（如线上）而收件箱在 http://127.0.0.1，
        Chrome 会发 Private Network Access 预检 —— 少了 Allow-Private-Network
        这一行，请求会被浏览器直接拦掉，且表现为「怎么都连不上」。
        """
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        if self.headers.get("Access-Control-Request-Private-Network"):
            self.send_header("Access-Control-Allow-Private-Network", "true")

    def _send(self, code, obj=None, text=None):
        body = text.encode("utf-8") if text is not None else json.dumps(
            obj if obj is not None else {}, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "text/plain; charset=utf-8" if text is not None
                         else "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except Exception:
            pass

    # ---------- 路由 ----------
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/", "/status"):
            with LOCK:
                st = dict(STATE)
            st["lastAtIso"] = now_iso() if st["lastAt"] else ""
            st["dir"] = self.out_dir
            self._send(200, st)
            return
        if path in ("/latest", "/latest.json"):
            p = os.path.join(self.out_dir, "latest.json")
            if not os.path.isfile(p):
                self._send(404, {"error": "还没有收到任何数据"})
                return
            with open(p, "r", encoding="utf-8") as f:
                self._send(200, text=f.read())
            return
        if path in ("/brief", "/latest.brief.txt"):
            p = os.path.join(self.out_dir, "latest.brief.txt")
            if not os.path.isfile(p):
                self._send(404, text="还没有收到任何数据")
                return
            with open(p, "r", encoding="utf-8") as f:
                self._send(200, text=f.read())
            return
        self._send(404, {"error": "未知路径", "routes": ["/status", "/latest", "/brief", "POST /ingest"]})

    def do_POST(self):
        path = self.path.split("?")[0]
        if path != "/ingest":
            self._send(404, {"error": "未知路径，请 POST 到 /ingest"})
            return
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = 0
        raw = self.rfile.read(n) if n > 0 else b""
        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception as e:
            self._send(400, {"error": "不是合法 JSON：" + str(e)})
            return
        if not isinstance(payload, dict):
            self._send(400, {"error": "顶层必须是对象"})
            return
        try:
            info = save_payload(payload, self.out_dir)
        except Exception as e:
            self._send(500, {"error": "落盘失败：" + str(e)})
            return

        st = info["status"]
        self._send(200, {"ok": True, "file": info["name"], "count": st["count"], "lastAt": st["lastAtIso"]})
        if not self.quiet:
            brief_first = (info["brief"] or "").strip().splitlines()
            head = brief_first[0] if brief_first else "(无摘要)"
            sys.stderr.write("[inbox] #%s 已收 %s 字节 · %s\n" % (st["count"], st["bytes"], head))
        if self.once:
            sys.stderr.write("[inbox] --once 已收到一笔，退出。\n")
            threading.Thread(target=self.server.shutdown, daemon=True).start()


def do_list(out_dir):
    if not os.path.isdir(out_dir):
        print("还没有任何记录：%s 不存在" % out_dir)
        return 1
    recv = os.path.join(out_dir, "recv")
    files = sorted(os.listdir(recv)) if os.path.isdir(recv) else []
    print("收件箱目录：%s" % out_dir)
    print("逐笔记录 %d 笔：" % len(files))
    for f in files[-20:]:
        print("  " + f)
    brief = os.path.join(out_dir, "latest.brief.txt")
    if os.path.isfile(brief):
        print("\n--- latest.brief.txt ---")
        with open(brief, "r", encoding="utf-8") as fh:
            print(fh.read())
    return 0


def main():
    ap = argparse.ArgumentParser(description="SerialLab 本地收件箱：接收网页端调试包并落盘给 AI 读")
    ap.add_argument("--port", type=int, default=7788, help="监听端口，默认 7788")
    ap.add_argument("--host", default="127.0.0.1", help="监听地址，默认 127.0.0.1（只本机可访问）")
    ap.add_argument("--dir", default=DEFAULT_DIR, help="落盘目录，默认 _本地工具/serial-inbox/")
    ap.add_argument("--once", action="store_true", help="只收一笔就退出")
    ap.add_argument("--list", action="store_true", help="只列出已收到的记录，不起服务")
    ap.add_argument("--quiet", action="store_true", help="不打日志")
    args = ap.parse_args()

    if args.list:
        return do_list(args.dir)

    ensure_dir(args.dir)
    Handler.out_dir = args.dir
    Handler.once = args.once
    Handler.quiet = args.quiet

    srv = ThreadingHTTPServer((args.host, args.port), Handler)
    print("SerialLab 本地收件箱已启动")
    print("  监听   http://%s:%d" % (args.host, args.port))
    print("  落盘   %s" % args.dir)
    print("  接口   POST /ingest  ·  GET /status  ·  GET /latest  ·  GET /brief")
    print("  网页端 串口调试助手 → 显示 → 勾选「HTTP 上报本地收件箱」，端口填 %d" % args.port)
    print("  AI 读  %s" % os.path.join(args.dir, "latest.brief.txt"))
    print("按 Ctrl+C 停止。")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")
    finally:
        srv.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
