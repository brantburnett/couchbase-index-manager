# couchbase-index-manager

[![Build Status](https://travis-ci.org/brantburnett/couchbase-index-manager.svg?branch=master)](https://travis-ci.org/brantburnett/couchbase-index-manager) [![npm version](https://badge.fury.io/js/couchbase-index-manager.svg)](https://badge.fury.io/js/couchbase-index-manager) [![Docker Image](https://img.shields.io/docker/pulls/btburnett3/couchbase-index-manager)](https://microbadger.com/images/btburnett3/couchbase-index-manager "Docker Image")

## Overview

Provides a programatic interface to manage Couchbase indexes, synchronizing
them to index definitions provided in files. It is intended to be used as part
of a CI/CD pipeline, or to assist with local development.

For example usage, see [the CLI implementation](https://github.com/brantburnett/couchbase-index-manager/blob/master/packages/couchbase-index-manager-cli)

> :warn: As of couchbase-index-manager 2.0, the minimum supported version of Couchbase Server is 5.5. For 4.x and 5.0 compatibility,
> use couchbase-index-manager 1.0.