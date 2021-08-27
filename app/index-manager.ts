import { Bucket, Cluster, DropQueryIndexOptions, QueryIndexManager } from 'couchbase';
import { isString } from 'lodash';
import { Version } from './feature-versions';

const WAIT_TICK_INTERVAL = 10000; // in milliseconds

export type TickHandler<T> = (this: T, timePassed: number) => void;

export interface WithClause {
    action?: string;
    num_replica?: number;
    nodes?: string[];
    num_partition?: number;
    retain_deleted_xattr?: boolean;
}

interface SystemIndexesIndex {
    id: string;
    name: string;
    namespace_id: string;
    keyspace_id: string;
    is_primary?: boolean;
    index_key: string[];
    condition?: string;
    partition: string;
    state: string;
    using: string;
}

interface IndexStatusIndex {
    bucket: string;
    index: string;
    hosts: string[];
    numReplica: number;
    numPartition: number;
    definition: string;
}

export interface CouchbaseIndex extends SystemIndexesIndex {
    num_replica: number;
    num_partition: number;
    nodes: string[];
    retain_deleted_xattr: boolean;
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
    private async getAllIndexes(): Promise<SystemIndexesIndex[]> {
        let qs = '';
        qs += 'SELECT idx.* FROM system:indexes AS idx';
        qs += ' WHERE keyspace_id="' + this.bucketName + '"';
        qs += ' AND `using`="gsi" ORDER BY is_primary DESC, name ASC';

        const res = await this.cluster.query(qs);

        const indexes: SystemIndexesIndex[] = [];
        res.rows.forEach((row) => {
            indexes.push(row);
        });

        return indexes;
    }

    /**
     * Gets index statuses for the bucket via the cluster manager
     */
    private async getIndexStatuses(): Promise<IndexStatusIndex[]> {
        const resp = await (this.manager as any)._http.request({
            type: 'MGMT',
            method: 'GET',
            path: '/indexStatus',
            timeout: 5000,
        });

        const body = resp.body ? JSON.parse(resp.body.toString()) : null;

        if (resp.statusCode !== 200) {
            if (!body) {
                throw new Error(
                    'operation failed (' + resp.statusCode +')');
            }

            throw new Error(body.reason);
        }

        const indexStatuses = (body.indexes as IndexStatusIndex[])
            .filter((index) => {
                return index.bucket === this.bucketName;
            });

        return indexStatuses;
    }

    async getIndexes(): Promise<CouchbaseIndex[]> {
        // We'll enrich the return value with missing fields
        const indexes = await this.getAllIndexes() as CouchbaseIndex[];

        // Get additional info from the index status API
        const statuses = await this.getIndexStatuses();

        // Apply hosts from index status API to index information
        statuses.forEach((status) => {
            // remove (replica X) from the end of the index name
            const indexName = /^([^\s]*)/.exec(status.index)[1];

            const index = indexes.find((index) => index.name === indexName) as CouchbaseIndex;
            if (index) {
                if (!index.nodes) {
                    index.nodes = [];
                }

                // add any hosts listed to index info
                // but only for the first if partitioned (others will be dupes)
                if (!index.partition || index.nodes.length === 0) {
                    index.nodes.push(...status.hosts);
                }

                // if this is the first found, set to 0, otherwise add 1
                if (index.num_replica === undefined) {
                    index.num_replica = 0;
                } else {
                    index.num_replica++;
                }

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
        await this.cluster.query(statement);
    }

    /**
     * Moves index replicas been nodes
     */
    async moveIndex(indexName: string, nodes: string[]): Promise<void> {
        let statement = 'ALTER INDEX ' +
            `\`${this.bucketName}\`.\`${indexName}\`` +
            ' WITH ';
        statement += JSON.stringify({
            action: 'move',
            nodes: nodes,
        });

        await this.cluster.query(statement);
    }

    /**
     * Moves index replicas been nodes
     */
    async resizeIndex(indexName: string, numReplica: number, nodes?: string[]): Promise<void> {
        let statement = 'ALTER INDEX ' +
            `\`${this.bucketName}\`.\`${indexName}\`` +
            ' WITH ';

        const withClause: WithClause = {
            action: 'replica_count',
            num_replica: numReplica,
        };

        if (nodes) {
            withClause.nodes = nodes;
        }

        statement += JSON.stringify(withClause);

        await this.cluster.query(statement);
    }

    /**
     * Builds any outstanding deferred indexes on the bucket
     */
    async buildDeferredIndexes(): Promise<string[]> {
        // Workaround for https://issues.couchbase.com/browse/JSCBC-771, we must build ourselves

        const indices = await this.manager.getAllIndexes(this.bucketName);

        const deferredList = [];
        for (let i = 0; i < indices.length; ++i) {
            const index = indices[i];

            if (index.state === 'deferred' || index.state === 'pending') {
                deferredList.push(index.name);
            }
        }

        // If there are no deferred indexes, we have nothing to do.
        if (deferredList.length === 0) {
            return;
        }

        let qs = '';
        qs += 'BUILD INDEX ON `' + this.bucketName + '` ';
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
    async waitForIndexBuild<T = void>(timeoutMilliseconds?: number, tickHandler?: TickHandler<T>, thisObj?: T): Promise<boolean> {
        const startTime = Date.now();
        let lastTick = startTime;

        /** Internal to trigger the tick */
        function testTick() {
            const now = Date.now();
            const interval = now - lastTick;
            if (interval >= WAIT_TICK_INTERVAL) {
                lastTick = now;

                if (tickHandler) {
                    tickHandler.call(thisObj, now - startTime);
                }
            }
        }

        while (!timeoutMilliseconds ||
            (Date.now() - startTime < timeoutMilliseconds)) {
            const indexes = await this.getIndexes();

            if (!indexes.find((p) => p.state !== 'online')) {
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
    async dropIndex(indexName: string, options?: DropQueryIndexOptions): Promise<void> {
        await this.manager.dropIndex(this.bucketName, indexName, options);
    }

    /**
     * Gets the version of the cluster
     */
    async getClusterVersion(): Promise<Version> {
        const resp = await (this.manager as any)._http.request({
            type: 'MGMT',
            method: 'GET',
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
                    'operation failed (' + resp.statusCode +')');
            }

            throw new Error(errData.reason);
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
    async getQueryPlan(statement: string): Promise<any> {
        statement = 'EXPLAIN ' + statement;

        const explain = await this.cluster.query(statement);

        const plan = explain.rows[0].plan;

        if (plan && plan.keys) {
            // Couchbase 5.0 started nesting within expr property
            // so normalize the returned object
            plan.keys = plan.keys.map((key: string | { expr: string }) =>
                isString(key) ? {expr: key} : key);
        }

        return plan;
    }
}
