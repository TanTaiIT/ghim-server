# Build nhiều tầng: tầng chạy KHÔNG mang theo toolchain, mã nguồn TS hay devDependencies.
FROM node:24-slim AS base
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
# Client sinh vào node_modules, mà node_modules ở tầng này là bản mới — không generate lại thì
# `@prisma/client` rỗng và app chết ngay lượt query đầu.
RUN pnpm exec prisma generate

# ── runtime ─────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps-prod /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json prisma.config.ts ./
COPY prisma ./prisma

# Không chạy bằng root: một lỗ RCE trong app không được kèm luôn quyền root trong container.
USER node
EXPOSE 3100
CMD ["node", "dist/server.js"]
