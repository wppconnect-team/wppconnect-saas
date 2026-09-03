FROM oven/bun:1-debian AS install
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

FROM oven/bun:1-debian
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=install /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
RUN mkdir -p /data && chown -R bun:bun /data
USER bun
ENV MEDIA_STORAGE_PATH=/data PORT=3100
EXPOSE 3100
CMD ["bun", "src/index.ts"]
