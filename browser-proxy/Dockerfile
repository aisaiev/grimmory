FROM mcr.microsoft.com/playwright:v1.52.0-jammy

WORKDIR /app

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV NODE_ENV=development

COPY package.json tsconfig.json ./
RUN npm install

COPY src/ ./src/
RUN ./node_modules/.bin/tsc

USER pwuser

ENV PROXY_PORT=7350
EXPOSE 7350

CMD ["node", "dist/proxy-server.js"]
