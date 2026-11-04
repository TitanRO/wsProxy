# doctl registry login --expiry-seconds 3600 && docker build -t registry.digitalocean.com/titanro-docr/wsproxy . && docker image push registry.digitalocean.com/titanro-docr/wsproxy
# Normally built by Tekton Pipelines-as-Code (.tekton/push.yaml) on pushes to master; titanro-ci[bot] pins the digest in
# TitanRO/sysops argo/prod-season/robrowser and argo/test-season/robrowser, and Argo CD deploys it. The line above is the manual fallback.

FROM node:24.22.2-alpine
ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
COPY allowed.js ./
COPY index.js ./

RUN npm install --production

COPY ./src ./src

CMD [ "npm", "start" ]
