FROM node:22-alpine AS verifier
WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run verify

FROM nginx:1.27-alpine
COPY ops/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=verifier /workspace/*.html /usr/share/nginx/html/
COPY --from=verifier /workspace/llms.txt /workspace/robots.txt /workspace/sitemap.xml /workspace/search-index.json /workspace/docs.manifest.json /usr/share/nginx/html/
COPY --from=verifier /workspace/assets /usr/share/nginx/html/assets
COPY --from=verifier /workspace/schemas /usr/share/nginx/html/schemas
COPY --from=verifier /workspace/test-vectors /usr/share/nginx/html/test-vectors
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:8080/index.html >/dev/null || exit 1
