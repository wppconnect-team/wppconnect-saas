FROM node:22-alpine AS build
WORKDIR /app
RUN npm install -g npm@11
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_WPP_SERVER
ARG VITE_WPP_SOCKET
ENV VITE_WPP_SERVER=$VITE_WPP_SERVER
ENV VITE_WPP_SOCKET=$VITE_WPP_SOCKET
RUN npm run build

FROM nginx:alpine AS runner
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost/health || exit 1
CMD ["nginx", "-g", "daemon off;"]
