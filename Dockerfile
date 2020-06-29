FROM node:12 as build

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY ./ ./
RUN npm run-script lint && \
    npm run-script build

FROM node:12
LABEL maintainer=bburnett@centeredgesoftware.com
WORKDIR /app
COPY --from=build /app ./
ENTRYPOINT ["/app/bin/couchbase-index-manager"]
