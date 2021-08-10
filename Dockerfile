FROM node:14 as build

RUN npm install -g npm@7.19.1
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY ./ ./
RUN npm run-script lint && \
    npm run-script build

FROM node:14
LABEL maintainer=bburnett@centeredgesoftware.com
WORKDIR /app
COPY --from=build /app ./

RUN ["ln", "-s", "/app/bin/couchbase-index-manager", "/bin/couchbase-index-manager"]
ENTRYPOINT ["/app/bin/couchbase-index-manager"]
