# syntax=docker/dockerfile:1
# Runs the CI verification in a clean Linux container, independent of the host's
# node_modules and tool versions. Usage: `pnpm run verify:clean`.
FROM node:24.22.0-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5

ENV CI=true
RUN corepack enable
WORKDIR /src
COPY . .
RUN --mount=type=cache,target=/root/.cache/pnpm-store \
    pnpm config set store-dir /root/.cache/pnpm-store \
    && pnpm install --frozen-lockfile
RUN pnpm run verify
