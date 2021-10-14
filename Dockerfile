FROM node:16 as build

WORKDIR /app
COPY ["package*.json", "lerna.json"]
COPY ["packages/couchbase-index-manager/package*.json", "./packages/couchbase-index-manager/"]
COPY ["packages/couchbase-index-manager-cli/package*.json", "./packages/couchbase-index-manager-cli/"]
RUN npm ci
COPY ./ ./
RUN npm run build

FROM node:16
LABEL maintainer=bburnett@centeredgesoftware.com
WORKDIR /app
COPY --from=build /app ./

RUN ["ln", "-s", "/app/bin/couchbase-index-manager", "/bin/couchbase-index-manager"]
ENTRYPOINT ["/app/bin/couchbase-index-manager"]
