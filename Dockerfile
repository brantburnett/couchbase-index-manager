FROM node:16 as build

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY ./ ./
RUN npm run-script lint && \
    npm run-script build

FROM node:16
LABEL maintainer=bburnett@centeredgesoftware.com
WORKDIR /app
COPY --from=build /app ./

RUN ["ln", "-s", "/app/bin/couchbase-index-manager", "/bin/couchbase-index-manager"]
ENTRYPOINT ["/app/bin/couchbase-index-manager"]
