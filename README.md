# couchbase-index-manager

[![Build Status](https://travis-ci.org/brantburnett/couchbase-index-manager.svg?branch=master)](https://travis-ci.org/brantburnett/couchbase-index-manager) [![npm version](https://badge.fury.io/js/couchbase-index-manager.svg)](https://badge.fury.io/js/couchbase-index-manager)

## Overview

Provides a command-line interface to manage Couchbase indexes, synchronizing
them to index definitions provided in files. It is intended to be used as part
of a CI/CD pipeline, or to assist with local development.

It also provides an API which may be used by importing a node module.

## Common parameters

- *-c couchbase://xxx* - Couchbase cluster, defaults to localhost
- *-u username* - Username to connect to the Couchbase cluster
- *-p password* - Password to connect to the Couchbase cluster
- *--no-rbac* - Disable RBAC, required to connect to 4.x clusters
- *--no-color* - Suppress color in output

## Sync Command

The sync command executes an index synchronization

```sh
couchbase-index-manager sync <bucketName> <path>
```

`bucketName` should be the name of the bucket to sync, and `path` is the path to the index definitions.  `path` may be either a single YAML or JSON file, or a directory containing multiple files.

### Options

- *-f* - Skip the configuration prompt, just run the sync (useful for scripting)
- *--dry-run* - Just output the plan, don't make any changes
- *--safe* - Don't drop any existing indexes, only create new ones
- *-t 30* - Seconds to wait for index build to complete, 0 for infinite (default 5m)
- *--bucket-password password* - For 4.x clusters, provides the bucket password for secure buckets

### Examples

```sh
couchbase-index-manager -c couchbase://localhost -u Administrator -p password sync beer-sample ./directory/
couchbase-index-manager -c couchbase://localhost -u Administrator -p password sync beer-sample ./directory/file.yaml
couchbase-index-manager -c couchbase://localhost -u Administrator -p password sync beer-sample ./directory/file.json
```


## Definition Files

Definition files may be written in either JSON or YAML.  The define the name of
the index, the columns to be index, and may also contain other options.

When YAML is used, multiple definitions may be provided in a single file, separated by a line of dashes.

```yaml
name: beer_primary
is_primary: true
---
name: BeersByAbv
index_key:
- abv
condition: (`type` = 'beer')
num_replica: 0
---
name: BeersByIbu
index_key:
- ibu
condition: (`type` = 'beer')
num_replica: 0
---
name: OldIndex
lifecycle:
  drop: true
```

| Field          | Required | Description |
| -------------- |--------- | ----------- |
| name           | Y | Name of the index. |
| is_primary     | N | True for a primary index. |
| index_key      | N | Array of index keys.  May be attributes of documents deterministic functions. |
| condition      | N | Condition for the WHERE clause of the index. |
| num_replica    | N | Defaults to 0, number of index replicas to create. |
| nodes          | N | List of nodes for index placement.  Automatic placement is used if not present. |
| lifecycle.drop | N | If true, drops the index if it exists. |

A primary index *must not* have index_key or condition properties.  A secondary index *must* have values in the index_key array.  Additionally, there may not be more than one primary index in the set of definitions.

If `nodes` and `num_replica` are both present, then `num_replica` must be the number of nodes minus one.

## Updating Indexes

It is important that couchbase-index-manager be able to recognize when indexes are updated.  Couchbase Server performs certain normalizations on both index_key and condition, meaning that the values in Couchbase may be slightly different than the values submitted when the index is created.

Therefore, it is important that the definition files be created with normalization in mind.  Make sure the definitions include the already normalized version of the keys and condition, otherwise couchbase-index-manager may drop and recreate the index on each run.

## Dropping Indexes

If an index is removed from the definition files, it is not dropped.  This prevents different CI/CD processes from interfering with each other as they manage different indexes.  To drop an index, leave the definition in place but set `lifecycle.drop` to `true`.

## Replicas and Couchbase Server 4.X

Replicas are emulated on Couchbase Server 4.X by creating multiple indexes.  If `num_replica` is greater than 0, the additional indexes are named with the suffix `_replicaN`, where N starts at 1.  For example, an index with 2 replicas named `MyIndex` will have 3 indexes, `MyIndex`, `MyIndex_replica1`, and `MyIndex_replica2`.

Note that the `nodes` list is only respected during index creation, indexes will not be moved between nodes if they already exist.

## Replicas and Couchbase Server 5

Currently, it isn't possible to detect replicas via queries to "system:indexes".  Therefore, `num_replica` is only respected during index creation.  Changes to `num_replica` on existing indexes will be ignored.

Note that the `nodes` list is only respected during index creation, indexes will not be moved between nodes if they already exist.


## Docker Image

A Docker image for running couchbase-index-manager is available at https://hub.docker.com/r/btburnett3/couchbase-index-manager.

```sh
docker run --rm -it -v ./:/definitions btburnett3/couchbase-index-manager -c couchbase://cluster -u Administrator -p password sync beer-sample /definitions
```
