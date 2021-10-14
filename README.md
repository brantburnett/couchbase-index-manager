# couchbase-index-manager

[![Build Status](https://travis-ci.org/brantburnett/couchbase-index-manager.svg?branch=master)](https://travis-ci.org/brantburnett/couchbase-index-manager) [![npm version](https://badge.fury.io/js/couchbase-index-manager.svg)](https://badge.fury.io/js/couchbase-index-manager) [![Docker Image](https://img.shields.io/docker/pulls/btburnett3/couchbase-index-manager)](https://microbadger.com/images/btburnett3/couchbase-index-manager "Docker Image")

## Overview

Provides a command-line interface to manage Couchbase indexes, synchronizing
them to index definitions provided in files. It is intended to be used as part
of a CI/CD pipeline, or to assist with local development.

It also provides an API which may be used by importing a node module.

> :warn: As of couchbase-index-manager 2.0, the minimum supported version of Couchbase Server is 5.5. For 4.x and 5.0 compatibility,
> use couchbase-index-manager 1.0.

## Detailed Documentation

- [couchbase-index-manager programmatic package](./packages/couchbase-index-manager)
- [couchbase-index-manager-cli command-line interface](./packages/couchbase-index-manager-cli)

## Installing the CLI

```sh
npm install -g couchbase-index-manager-cli
```

## Docker Image

A Docker image for running couchbase-index-manager is available at [Docker Hub](https://hub.docker.com/r/btburnett3/couchbase-index-manager).

```sh
docker run --rm -it -v ./:/definitions btburnett3/couchbase-index-manager -c couchbase://cluster -u Administrator -p password sync beer-sample /definitions
```
