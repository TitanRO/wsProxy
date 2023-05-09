# syntax=docker/dockerfile:experimental
# DOCKER_BUILDKIT=1 docker build --ssh default -t registry.digitalocean.com/titanro-docr/wsproxy . && docker image push registry.digitalocean.com/titanro-docr/wsproxy

FROM node:18-alpine
ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
COPY allowed.js ./
COPY index.js ./

RUN npm install --production

COPY ./src ./src

CMD [ "npm", "start" ]
