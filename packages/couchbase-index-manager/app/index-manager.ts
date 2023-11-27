import { Bucket, Cluster, DropQueryIndexOptions, QueryIndexManager } from 'couchbase';
import { HttpExecutor, HttpMethod, HttpServiceType } from 'couchbase/dist/httpexecutor';
import { isString } from 'lodash';
import { PartitionStrategy } from './configuration';
import { Version } from './feature-versions';
import { ensureEscaped } from './util';

const WAIT_TICK_INTERVAL = 10000; // in milliseconds

export const DEFAULT_SCOPE = '_default';
export const DEFAULT_COLLECTION = '_default';

export type TickHandler = (timePassed: number) => void;

export interface WithClause {
    action?: string;
    num_replica?: number;
    nodes?: string[];
    num_partition?: number;
    retain_deleted_xattr?: boolean;
}

export interface WaitForIndexBuildOptions {
    timeoutMs?: number;
    scope?: string;
    collection?: string;
}

interface SystemIndex {
    id: string;
    name: string;
    bucket_id?: string;
    scope_id?: string;
    namespace_id: string;
    keyspace_id: string;
    is_primary?: boolean;
    index_key: string[];
    condition?: string;
    partition?: string;
    state: string;
    using: string;
}

interface SystemIndexNormalized extends SystemIndex {
    bucket_id: string;
    scope_id: string;
}

interface IndexStatus {
    bucket: string;
    scope?: string;
    collection?: string;
    index: string;
    hosts: string[];
    numReplica: number;
    numPartition: number;
    definition: string;
}

type IndexStatusNormalized = Required<IndexStatus>

export interface CouchbaseIndex extends Omit<SystemIndex, "bucket_id" | "namespace_id" | "scope_id" | "keyspace_id"> {
    scope: string;
    collection: string;
    num_replica: number;
    num_partition: number;
    nodes: string[];
    retain_deleted_xattr: boolean;
}

export interface CreateIndexPlanKey {
    expr: string;
    desc?: boolean;
}

interface IndexCreatePlanUnnormalized {
    keys?: CreateIndexPlanKey[] | string[];
    where?: string;
    partition?: {
        exprs: string[];
        strategy: PartitionStrategy;
    }
}

/**
 * Subset of fields returned on a query plan for CREATE INDEX
 */
export interface IndexCreatePlan extends IndexCreatePlanUnnormalized {
    keys?: CreateIndexPlanKey[];
}

function normalizeIndex(index: SystemIndex): SystemIndexNormalized {
    if (!index.bucket_id) {
        // no bucket_id means we're not in a collection, let's normalize to the default collection
        return {
            ...index,
            bucket_id: index.keyspace_id,
            scope_id: DEFAULT_SCOPE,
            keyspace_id: DEFAULT_COLLECTION,
        };
    }

    return index as SystemIndexNormalized;
}

function normalizeStatus(status: IndexStatus): IndexStatusNormalized {
    // Older versions of Couchbase Server without scope/collection support won't return those values
    // Add them if they are missing

    return {
        scope: DEFAULT_SCOPE,
        collection: DEFAULT_COLLECTION,
        ...status
    };
}

// Note: Assumes both the index and status have been normalized
function isStatusMatch(index: CouchbaseIndex, status: IndexStatus): boolean {
    // Remove (replica X) from the end of the index name
    const match = /^([^\s]*)/.exec(status.index)
    const indexName = match ? match[1] : '';

    return index.name === indexName &&
        index.scope === status.scope &&
        index.collection === status.collection;
}

export function getKeyspace(bucket: string, scope = DEFAULT_SCOPE, collection = DEFAULT_COLLECTION): string {
    if (scope === DEFAULT_SCOPE && collection === DEFAULT_COLLECTION) {
        return ensureEscaped(bucket);
    } else {
        return `${ensureEscaped(bucket)}.${ensureEscaped(scope)}.${ensureEscaped(collection)}`;
    }
}

/**
 * Manages Couchbase indexes
 */
export class IndexManager {
    private manager: QueryIndexManager;

    /**
     * @param {Bucket} bucket
     * @param {Cluster} cluster
     */
    constructor(private bucket: Bucket, private cluster: Cluster) {
        this.bucket = bucket;
        this.cluster = cluster;
        this.manager = cluster.queryIndexes();
    }

    /**
     * Get the name of the bucket being managed
     */
    get bucketName(): string {
        return this.bucket.name;
    }

    /**
     * Gets all indexes using a query
     * Workaround until https://issues.couchbase.com/projects/JSCBC/issues/JSCBC-772 is resolved
     */
    private async getAllIndexes(): Promise<SystemIndexNormalized[]> {
        let qs = '';
        qs += 'SELECT idx.* FROM system:indexes AS idx';
        qs += ` WHERE (bucket_id IS MISSING AND keyspace_id = "${this.bucketName}")`;
        qs += ` OR bucket_id = "${this.bucketName}"`
        qs += ' AND `using`="gsi" ORDER BY is_primary DESC, name ASC';

        const res = await this.cluster.query(qs);

        return res.rows.map(normalizeIndex);
    }

    /**
     * Gets index statuses for the bucket via the cluster manager
     */
    private async getIndexStatuses(): Promise<IndexStatusNormalized[]> {
        const httpExecutor = new HttpExecutor(this.cluster.conn);

        const resp = await httpExecutor.request({
            type: HttpServiceType.Management,
            method: HttpMethod.Get,
            path: '/indexStatus',
            timeout: 5000,
        });

        const body = resp.body ? JSON.parse(resp.body.toString()) : null;

        if (resp.statusCode !== 200) {
            if (!body) {
                throw new Error(
                    `operation failed (${resp.statusCode})`);
            }

            throw new Error(body.reason as string);
        }

        const indexStatuses = (body.indexes as IndexStatus[])
            .filter((index) => {
                return index.bucket === this.bucketName;
            })
            .map(normalizeStatus);

        return indexStatuses;
    }

    async getIndexes(scope?: string, collection?: string): Promise<CouchbaseIndex[]> {
        const indexes: CouchbaseIndex[] = (await this.getAllIndexes())
            .filter(index => !scope || (index.scope_id === scope && index.keyspace_id === collection))
            .map(index => ({
                // Enrich with additional fields. These will be further updated using status below.
                ...index,
                scope: index.scope_id,
                collection: index.keyspace_id,
                nodes: [] as string[],
                num_replica: -1,
                num_partition: 1,
                retain_deleted_xattr: false
            }));

        // Get additional info from the index status API, and map by name
        const statuses = await this.getIndexStatuses();

        // Apply hosts from index status API to index information
        statuses.forEach((status) => {
            const index = indexes.find((index) => isStatusMatch(index, status)) as CouchbaseIndex;
            if (index) {
                // add any hosts listed to index info
                // but only for the first if partitioned (others will be dupes)
                if (!index.partition || index.nodes.length === 0) {
                    index.nodes.push(...status.hosts);
                }

                // Each status record we find beyond the first indicates one replica
                // We started at -1 so if there aren't any replicas we'll end at 0
                index.num_replica++;

                index.retain_deleted_xattr =
                    /"retain_deleted_xattr"\s*:\s*true/.test(status.definition);
                index.num_partition = status.numPartition;
            }
        });

        return indexes;
    }

    /**
     * Creates an index based on an index definition
     */
    async createIndex(statement: string): Promise<void> {
        await this.cluster.query(statement, {adhoc: true});
    }

    private getAlterStatement(indexName: string, scope: string, collection: string, withClause: WithClause): string {
        let statement: string;

        if (scope === DEFAULT_SCOPE && collection === DEFAULT_COLLECTION) {
            // We need to use the old syntax for the default collection for backward compatibilty
            statement = `ALTER INDEX ${ensureEscaped(this.bucketName)}.${ensureEscaped(indexName)} WITH `;
        } else {
            statement = `ALTER INDEX ${ensureEscaped(indexName)} ON ${getKeyspace(this.bucketName, scope, collection)} WITH `;
        }

        statement += JSON.stringify(withClause);

        return statement;
    }

    /**
     * Moves index replicas been nodes
     */
    async moveIndex(indexName: string, scope: string, collection: string, nodes: string[]): Promise<void> {
        const withClause: WithClause = {
            action: 'move',
            nodes: nodes,
        };

        const statement = this.getAlterStatement(indexName, scope, collection, withClause);

        await this.cluster.query(statement, {adhoc: true});
    }

    /**
     * Moves index replicas been nodes
     */
    async resizeIndex(indexName: string, scope: string, collection: string, numReplica: number, nodes?: string[]): Promise<void> {
        const withClause: WithClause = {
            action: 'replica_count',
            num_replica: numReplica,
        };

        if (nodes) {
            withClause.nodes = nodes;
        }

        const statement = this.getAlterStatement(indexName, scope, collection, withClause);
        console.log(statement);
        await this.cluster.query(statement, {adhoc: true});
    }

    /**
     * Builds any outstanding deferred indexes on the bucket
     */
    async buildDeferredIndexes(scope = DEFAULT_SCOPE, collection = DEFAULT_COLLECTION): Promise<string[]> {
        // Because the built-in buildDeferredIndexes doesn't filter by scope/collection, we must build ourselves

        const deferredList = (await this.getAllIndexes()).filter(index => 
                index.scope_id === scope && 
                index.keyspace_id === collection &&
                (index.state === 'deferred' || index.state === 'pending'))
            .map(index => index.name);

        // If there are no deferred indexes, we have nothing to do.
        if (deferredList.length === 0) {
            return [];
        }

        const keyspace = scope === DEFAULT_SCOPE && collection === DEFAULT_COLLECTION
            ? `\`${this.bucketName}\``
            : `\`${this.bucketName}\`.\`${scope}\`.\`${collection}\``;

        let qs = '';
        qs += `BUILD INDEX ON ${keyspace} `;
        qs += '(';
        for (let j = 0; j < deferredList.length; ++j) {
            if (j > 0) {
                qs += ', ';
            }
            qs += '`' + deferredList[j] + '`';
        }
        qs += ')';

        // Run our deferred build query
        await this.cluster.query(qs);

        return deferredList;
    }

    /**
     * Monitors building indexes and triggers a Promise when complete
     */
    async waitForIndexBuild(options: WaitForIndexBuildOptions, tickHandler: TickHandler): Promise<boolean> {
        const effectiveOptions = {
            scope: DEFAULT_SCOPE,
            collection: DEFAULT_COLLECTION,
            ...options,
        };

        const startTime = Date.now();
        let lastTick = startTime;

        /** Internal to trigger the tick */
        function testTick() {
            const now = Date.now();
            const interval = now - lastTick;
            if (interval >= WAIT_TICK_INTERVAL) {
                lastTick = now;

                if (tickHandler) {
                    tickHandler(now - startTime);
                }
            }
        }

        while (!effectiveOptions.timeoutMs ||
            (Date.now() - startTime < effectiveOptions.timeoutMs)) {
            const indexes = (await this.getAllIndexes())
                .filter(index => index.scope_id === effectiveOptions.scope &&
                    index.keyspace_id === effectiveOptions.collection && 
                    index.state !== 'online');

            if (indexes.length === 0) {
                // All indexes are online
                return true;
            }

            // Because getIndexes has a latency,
            // To get more accurate ticks check before and after the wait
            testTick();

            await new Promise((resolve) => setTimeout(resolve, 1000));

            testTick();
        }

        // Timeout
        return false;
    }

    /**
     * Drops an existing index
     */
    async dropIndex(indexName: string, scope = DEFAULT_SCOPE, collection = DEFAULT_COLLECTION, options?: DropQueryIndexOptions): Promise<void> {
        if (scope === DEFAULT_SCOPE && collection === DEFAULT_COLLECTION) {
            await this.manager.dropIndex(this.bucketName, indexName, options);
        } else {
            const qs = `DROP INDEX ${ensureEscaped(indexName)} ON ${getKeyspace(this.bucketName, scope, collection)}`;

            // Run our deferred build query
            await this.cluster.query(qs, {
                timeout: options?.timeout,
                adhoc: true
            });
        }
    }

    /**
     * Gets the version of the cluster
     */
    async getClusterVersion(): Promise<Version> {
        const httpExecutor = new HttpExecutor(this.cluster.conn)

        const resp = await httpExecutor.request({
            type: HttpServiceType.Management,
            method: HttpMethod.Get,
            path: '/pools/default',
            timeout: 5000,
        });

        if (resp.statusCode !== 200) {
            let errData = null;
            try {
                errData = JSON.parse(resp.body.toString());
            } catch (e) {
                // ignore
            }

            if (!errData) {
                throw new Error(
                    `operation failed (${resp.statusCode})`);
            }

            throw new Error(errData.reason as string);
        }

        const poolData = JSON.parse(resp.body.toString()) as {
            nodes: {
                clusterCompatibility: number
            }[]
        };
        const minCompatibility = poolData.nodes.reduce(
            (accum, value) => {
                if (value.clusterCompatibility < accum) {
                    accum = value.clusterCompatibility;
                }

                return accum;
            }, 65535 * 65536);

        const clusterCompatibility = minCompatibility < 65535 * 65536 ?
            minCompatibility :
            0;

        return {
            major: Math.floor(clusterCompatibility / 65536),
            minor: clusterCompatibility & 65535,
        };
    }

    /**
     * Uses EXPLAIN to get a query plan for a statement
     */
    async getQueryPlan(statement: string): Promise<IndexCreatePlan> {
        statement = 'EXPLAIN ' + statement;

        const explain = (await this.cluster.query(statement, { adhoc: true })) as {
            rows: {
                plan: IndexCreatePlanUnnormalized
            }[]
        };

        const plan = explain.rows[0].plan;

        if (plan && plan.keys) {
            // Couchbase 5.0 started nesting within expr property
            // so normalize the returned object
            plan.keys = plan.keys.map((key: string | { expr: string }) =>
                isString(key) ? {expr: key} : key);
        }

        return plan as IndexCreatePlan;
    }
}
