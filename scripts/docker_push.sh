#!/bin/bash
docker login -u "$DOCKER_USERNAME" -p "$DOCKER_PASSWORD";
docker tag btburnett3/couchbase-index-manager:${TRAVIS_BUILD_NUMBER} btburnett3/couchbase-index-manager:${TRAVIS_TAG};
docker tag btburnett3/couchbase-index-manager:${TRAVIS_BUILD_NUMBER} btburnett3/couchbase-index-manager:latest;
docker push btburnett3/couchbase-index-manager:${TRAVIS_TAG};
docker push btburnett3/couchbase-index-manager:latest;
