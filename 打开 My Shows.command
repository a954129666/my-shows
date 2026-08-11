#!/bin/zsh
# 本地模式入口：使用原来的 localhost:5173，以便读取该地址下的浏览器数据。
set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

npm run dev -- --host localhost --port 5173 --strictPort &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

sleep 1
open "http://localhost:5173"

echo "My Shows 已打开。请保持此窗口开启；按 Control + C 可停止。"
wait "$SERVER_PID"
