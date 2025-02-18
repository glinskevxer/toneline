# The locate desk as a container. Nothing in here listens on a port: the image
# exists so a scheduled job can run the same commands the operators run, with
# the configuration and the extracts mounted in at /desk.
FROM node:20.18.2-bookworm-slim

ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

WORKDIR /opt/toneline

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY bin ./bin
COPY src ./src
COPY examples ./examples

RUN ln -s /opt/toneline/bin/toneline.js /usr/local/bin/toneline \
    && chmod +x /opt/toneline/bin/toneline.js

USER node
WORKDIR /desk

ENTRYPOINT ["toneline"]
CMD ["--help"]
