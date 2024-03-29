# couchbase-index-manager-cli

[![Build Status](https://travis-ci.org/brantburnett/couchbase-index-manager.svg?branch=master)](https://travis-ci.org/brantburnett/couchbase-index-manager) [![npm version](https://badge.fury.io/js/couchbase-index-manager.svg)](https://badge.fury.io/js/couchbase-index-manager) [![Docker Image](https://img.shields.io/docker/pulls/btburnett3/couchbase-index-manager)](https://microbadger.com/images/btburnett3/couchbase-index-manager "Docker Image")

## Overview

Provides a command-line interface to manage Couchbase indexes, synchronizing
them to index definitions provided in files. It is intended to be used as part
of a CI/CD pipeline, or to assist with local development.

> :warn: As of couchbase-index-manager 2.0, the minimum supported version of Couchbase Server is 5.5. For 4.x and 5.0 compatibility,
> use couchbase-index-manager 1.0.

## Common parameters

- *-c couchbase://xxx* - Couchbase cluster, defaults to localhost
- *-u username* - Username to connect to the Couchbase cluster
- *-p password* - Password to connect to the Couchbase cluster
- *-q* - Quiet output, only prints errors and warnings
- *--no-color* - Suppress color in output

## Sync Command

The sync command executes an index synchronization

```sh
couchbase-index-manager [common-options] sync [sync-options] <bucketName> <path...>
```

`bucketName` should be the name of the bucket to sync, and `path` is the path to the index definitions.  `path` may be either a single YAML or JSON file, or a directory containing multiple files.  Multiple paths may also be provided, they will be processed in order.

Supply "-" as the path to process definitions from stdin.  JSON input will be assumed if it starts with a curly brace, otherwise it will be parsed as YAML.

```sh
cat definitions.yaml | couchbase-index-manager -c couchbase://node -u Administrator -p password sync beer-sample -
```

**Note:** --force is assumed if processing from stdin.

### Options

- *-f* - Skip the confirmation prompt, just run the sync (useful for scripting)
- *--dry-run* - Just output the plan, don't make any changes
- *--safe* - Don't drop any existing indexes, only create new ones
- *-t 30* - Seconds to wait for index build to complete, 0 for infinite (default 5m)

### Sync Examples

```sh
couchbase-index-manager -c couchbase://localhost -u Administrator -p password sync beer-sample ./directory/
couchbase-index-manager -c couchbase://localhost -u Administrator -p password sync beer-sample ./directory/file.yaml
couchbase-index-manager -c couchbase://localhost -u Administrator -p password sync beer-sample ./directory/file.json
```

## Validate Command

```sh
couchbase-index-manager [common-options] validate [validate-options] <path...>
```

The validate command loads definition files and confirms they are valid. This is typically used as part of a continuous integration process for repositories containing definition files.

Optionally, the validate command can connect to a Couchbase cluster and use EXPLAIN on CREATE INDEX commands to further validate the syntax of the definitions.  When using `--validate-syntax`, a bucket name must be provided.

### Validate Examples

```sh
couchbase-index-manager validate ./directory/
couchbase-index-manager validate ./directory/file.yaml
couchbase-index-manager validate ./directory/file.json
couchbase-index-manager -c couchbase://localhost -u Administrator -p password validate --validate-syntax beer-sample ./directory/
```

## Definition Files

Definition files may be written in either JSON or YAML.  They define the name of
the index, the columns to be index, and may also contain other options.

When YAML is used, multiple definitions may be provided in a single file, separated by a line of dashes.

```yaml
name: beer_primary
is_primary: true
---
name: BeersByAbv
index_key:
- abv DESC
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

| Field              | Required | Description |
| ------------------ |--------- | ----------- |
| type               | N | If present, must be "index" |
| name               | Y | Name of the index. |
| scope              | N | Scope of the index (Couchbase 7.0 and later) |
| collection         | N | Collection of the index (Couchbase 7.0 and later) |
| is_primary         | N | True for a primary index. |
| index_key          | N | Array of index keys.  May be attributes of documents or deterministic functions. |
| condition          | N | Condition for the WHERE clause of the index. |
| retain_deleted_xattr | N | Boolean, used for Sync Gateway indexes |
| partition          | N | Object to specify index partitioning |
| partition.exprs    | Y | Required if `partition` is present, array of strings for attributes used to create partition |
| partition.stragegy | N | Partition strategy to use, defaults to `hash` |
| partition.num_partition | N | Number of partitions, defaults to 8 |
| manual_replica     | N | Force manual replica management, rather than automatic replicas. |
| num_replica        | N | Defaults to 0, number of index replicas to create. |
| nodes              | N | List of nodes for index placement.  Automatic placement is used if not present. |
| lifecycle.drop     | N | If true, drops the index if it exists. |

A primary index *must not* have index_key or condition properties.  A secondary index *must* have values in the index_key array.  Additionally, there may not be more than one primary index in the set of definitions.

You may append `DESC` to the end of an index_key to use a descending collation.

If `nodes` and `num_replica` are both present, then `num_replica` must be the number of nodes minus one.

### Scopes and Collections

Scopes and collections are supported in couchbase-index-manager 2.0 and later combined with Couchbase Server 7.0 and later. If the scope and
collection are not supplied, the index will be assigned to the `_default` scope/collection. Manually specifying `_default` is not required,
but is acceptable even on older versions of Couchbase Server. A value must be supplied for both scope and collection if either is supplied.

The index build step is run sequentially against each collection, they are not run in parallel to reduce load on the cluster.

## Overrides

When deploying to multiple environments, there may be variations in index definitions.  For example, you may have a different number of replicas or a different list of node assignments.  To support this, you may also apply overrides to the index definitions.

Overrides are processed in the order they are found, and can only override index definitions that with the same name, scope, and collection.
The index definition must also be found before the override. Any field which is not supplied on the override will be skipped, leaving the original
value unchanged. The exception is `nodes` and `num_replica`, updating one will automatically adjust the other field.

| Field              | Required | Description |
| ------------------ |--------- | ----------- |
| type               | Y | Always "override". |
| name               | Y | Name of the index. |
| scope              | N | Scope of the index (Couchbase 7.0 and later) |
| collection         | N | Collection of the index (Couchbase 7.0 and later) |
| is_primary         | N | True for a primary index. |
| index_key          | N | Array of index keys.  May be attributes of documents or deterministic functions. |
| condition          | N | Condition for the WHERE clause of the index. |
| retain_deleted_xattr | N | Boolean, used for Sync Gateway indexes |
| partition          | N | Object to specify index partitioning.  Use `null` to remove partition during override. |
| partition.exprs    | N | Array of strings for attributes used to create partition, replaces the existing array. |
| partition.stragegy | N | Partition strategy to use |
| partition.num_partition | N | Number of partitions, defaults to 8 |
| manual_replica     | N | Force manual replica management, rather than automatic replicas. |
| num_replica        | N | Number of index replicas to create. |
| nodes              | N | List of nodes for index placement. |
| lifecycle.drop     | N | If true, drops the index if it exists. |
| post_process       | N | Optional Javascript function body which may further alter the index definition. "this" will be the index definition. |

## Node Maps

When deploying to multiple environments, the names and IPs of nodes in the clusters probably vary.  You may use node maps to provide aliases for nodes to support these different environments.  Even for a single environment it may be useful to help reduce repetition.  For example, you may define several indexes referencing "node1" and "node2" in the `nodes` attribute.  Then add a node map which maps "node1" to "172.21.0.2" and "node2" to "127.21.0.3".

Node maps are processed in the order they are encountered, and values defined in later node maps will override or append to earlier node maps.  Any node not found in the node map will be unchanged and treated as a fully qualified name.

| Field          | Required | Description |
| -------------- |--------- | ----------- |
| type           | Y | Always "nodeMap".  |
| map            | Y | A hashmap keyed by alias, with the value being the fully qualified node name. |

### Example

```yaml
name: BeersByIbu
index_key:
- ibu
condition: (`type` = 'beer')
nodes:
- node1
- node2
---
type: nodeMap
map:
  node1: 172.21.0.2
  node2: 172.21.0.3
```

## Updating Indexes

Updating existing indexes is currently an unsafe operation in most cases.  This is because the index must be dropped and recreated, so there is some period of time when the index is unavailable for queries.  The exception is if you have at least 1 replica configured and `manual_replica` is `true`.  In this case, the replicas are replaced one at a time so at least one replica is always available.

## Dropping Indexes

If an index is removed from the definition files, it is not dropped.  This prevents different CI/CD processes from interfering with each other as they manage different indexes.  To drop an index, leave the definition in place but set `lifecycle.drop` to `true`.

## Manual Index Replica Management

If `manual_replica` is set to true on the index definition, couchbase-index-manager will control replicas directly. If `num_replica` is greater than 0, the additional indexes are named with the suffix `_replicaN`, where N starts at 1.  For example, an index with 2 replicas named `MyIndex` will have 3 indexes, `MyIndex`, `MyIndex_replica1`, and `MyIndex_replica2`.

During updates, changes to the `nodes` list may result in indexes being moved from one node to another. So long as there is at least one replica this is considered a safe operation, as each replica will be moved independently leaving other replicas available to serve requests.  Changes to the order of the node list are ignored, only adding or removing nodes results in a change.

## Automatic Index Replica Management

Automatic index replica management is the default. In this case, replicas are managed by Couchbase Server directly, rather than by couchbase-index-manager.

Because ALTER INDEX on Couchbase Server 6.0 and earlier cannot change the number of replicas, changes to `num_replica` or the number of nodes in `nodes` is an unsafe change that will drop and recreate the index. Starting with Couchbase Server 6.5 changing the number of replicas is a safe operation using ALTER INDEX.

### Limitations of Automatic Index Replica Management

1. You may not change the number of replicas and the node assignments at the same time.
2. If you change a core feature of the index (keys, condition, partition, etc) the index will be
   dropped and recreated, resulting in some downtime. Manual replicas would execute this process
   one replica at a time without downtime.

> :warn: Automatic index replica management is the recommended practice for Couchbase Server 6.5 and later in most scenarios.
> The limitations of automatic management are normally outweighed by the benefits during node failures, where Couchbase
> automatically manages repairing the replicas.

## Docker Image

A Docker image for running couchbase-index-manager is available at [Docker Hub](https://hub.docker.com/r/btburnett3/couchbase-index-manager).

```sh
docker run --rm -it -v ./:/definitions btburnett3/couchbase-index-manager -c couchbase://cluster -u Administrator -p password sync beer-sample /definitions
```
