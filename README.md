# couchbase-index-manager

## Overview

Provides a command-line interface to manage Couchbase indexes, synchronizing
them to index definitions provided in files. It is intended to be used as part
of a CI/CD pipeline, or to assist with local development.

It also provides an API which may be used by importing a node module.

## Common parameters

- *-c couchbase://xxx* - Couchbase cluster, defaults to localhost
- *-u username* - Username to connect to the Couchbase cluster
- *-p password* - Password to connect to the Couchbase cluster
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
| name           | Y | Name of the index |
| index_key      | Y | Array of index keys.  May be attributes of documents deterministic functions |
| condition      | N | Condition for the WHERE clause of the index |
| num_replicas   | N | Defaults to 0, number of index replicas to create |
| lifecycle.drop | N | If true, drops the index if it exists |

## Updating Indexes

It is important that couchbase-index-manager be able to recognize when indexes are updated.  Couchbase Server performs certain normalizations on both index_key and condition, meaning that the values in Couchbase may be slightly different than the values submitted when the index is created.

Therefore, it is important that the definition files be created with normalization in mind.  Make sure the definitions include the already normalized version of the keys and condition, otherwise couchbase-index-manager may drop and recreate the index on each run.

## Dropping Indexes

If an index is removed from the definition files, it is not dropped.  This prevents different CI/CD processes from interfering with each other as they manage different indexes.  To drop an index, leave the definition in place but set `lifecycle.drop` to `true`.

## Docker Image

A Docker image for running couchbase-index-manager is available at https://hub.docker.com/r/btburnett3/couchbase-index-manager.

```sh
docker run --rm -it -v ./:/definitions btburnett3/couchbase-index-manager -c couchbase://cluster -u Administrator -p password sync beer-sample /definitions
```
