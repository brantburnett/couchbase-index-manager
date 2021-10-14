FROM node:16 as build

WORKDIR /app
COPY ["package*.json", "lerna.json", "./"]
COPY ["packages/couchbase-index-manager/package*.json", "./packages/couchbase-index-manager/"]
COPY ["packages/couchbase-index-manager-cli/package*.json", "./packages/couchbase-index-manager-cli/"]
RUN npm ci
COPY ./ ./
RUN npm run build

FROM node:16
LABEL maintainer=bburnett@centeredgesoftware.com
WORKDIR /app
COPY --from=build /app ./

RUN ["ln", "-s", "/app/packages/couchbase-index-manager-cli/bin/couchbase-index-manager", "/bin/couchbase-index-manager"]
ENTRYPOINT ["/bin/couchbase-index-manager"]
