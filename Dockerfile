FROM node:8-alpine as build

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY ./ ./
RUN npm run-script lint && \
    npm run-script build

FROM node:8-alpine
LABEL maintainer=bburnett@centeredgesoftware.com
WORKDIR /app
COPY --from=build /app ./
ENTRYPOINT ["/app/bin/couchbase-index-manager"]
