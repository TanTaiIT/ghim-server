#!/bin/sh
# Lệnh khởi động cho nơi không có bước pre-deploy (gói free của Render, `render.free.yaml`): migrate rồi mới nhận
# request. Chỉ an toàn khi chạy đúng một tiến trình — hai bản khởi động cùng lúc là hai lượt migrate cùng lúc.
# Production có pre-deploy thì dùng CMD của Dockerfile, migration không chạy lúc khởi động.
set -e
node_modules/.bin/prisma migrate deploy
# `exec`: node thay chỗ shell để tự nhận SIGTERM lúc Render dừng container — tắt êm (server.ts) mới chạy.
exec node --enable-source-maps dist/server.js
