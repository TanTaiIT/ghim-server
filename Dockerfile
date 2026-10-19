# Build nhiều tầng: tầng chạy KHÔNG mang theo toolchain, mã nguồn TS hay devDependencies.
FROM node:24-slim AS base
# Schema engine của Prisma (`migrate deploy`) là binary nối libssl của hệ thống, mà bản slim không có: thiếu thì lúc
# cài Prisma tải nhầm bản openssl-1.1 và migration chết. CA để engine xác thực TLS khi Postgres nối qua Internet (dev trên Neon).
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

# ── deps: cài đủ cả dev để build được ─────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
# `--frozen-lockfile`: lockfile lệch package.json thì DỪNG, đừng tự giải lại — bản dựng phải
# khớp đúng thứ đã test, không phải thứ mới nhất tại thời điểm build.
RUN pnpm install --frozen-lockfile

# ── build: sinh Prisma client rồi biên dịch TS ───────────────────────────────
FROM deps AS build
COPY . .
RUN pnpm exec prisma generate && pnpm run build

# ── deps-prod: chỉ dependencies, nhưng vẫn phải generate lại client ──────────
FROM base AS deps-prod
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --prod
COPY prisma ./prisma
COPY prisma.config.ts ./
# `prisma.config.ts` chặn nhầm DB bằng chốt dùng chung với app — file đó không import gì, chép riêng nó.
COPY src/config/database-guard.ts ./src/config/
# Client sinh vào node_modules, mà node_modules ở tầng này là bản mới — không generate lại thì
# `@prisma/client` rỗng và app chết ngay lượt query đầu. `prisma` (CLI) và `dotenv` nằm trong
# `dependencies` vì image chạy còn dùng chúng để migrate.
RUN pnpm exec prisma generate

# ── runtime ─────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps-prod /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json prisma.config.ts ./
COPY prisma ./prisma
COPY src/config/database-guard.ts ./src/config/

# Không chạy bằng root: một lỗ RCE trong app không được kèm luôn quyền root trong container.
USER node
EXPOSE 3100
# Migration chạy bằng chính image này TRƯỚC khi bản mới nhận traffic (Render: pre-deploy command):
#   node_modules/.bin/prisma migrate deploy
# Không gọi qua pnpm: image chạy không mang pnpm, corepack sẽ đi tải về lúc deploy.
# Source map đã có trong dist/: không bật thì stack trace production trỏ vào mã đã biên dịch.
CMD ["node", "--enable-source-maps", "dist/server.js"]
