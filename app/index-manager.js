import {isString} from 'lodash';

const WAIT_TICK_INTERVAL = 10000; // in milliseconds

/**
 * @callback tickHandler
 * @param {number} milliseconds Milliseconds since the build wait was started
 */

/**
 * @callback httpResponse
 * @param {*} err Error or null
 * @param {*} resp HTTP response
 * @param {*} strBuffer Response data as a string
 */

/**
  * @typedef Version
  * @property {number} major
  * @property {number} minor
  */

/**
 * Manages Couchbase indexes
 *
 * @property {!boolean} is4XCluster
 */
export class IndexManager {
    /**
     * @param {Bucket} bucket
     * @param {Cluster} cluster
     */
    constructor(bucket, cluster) {
        this.bucket = bucket;
        this.cluster = cluster;
        this.manager = cluster.queryIndexes();
    }

    /** Get the name of the bucket being managed
     * @return {string}
    */
    get bucketName() {
        return this.bucket.name;
    }

    /**
     * @private
     * Gets index statuses for the bucket via the cluster manager
     *
     * @return {Promise.array}
     */
    async getIndexStatuses() {
        const resp = await this.manager._http.request({
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

        let indexStatuses = body.indexes.filter((index) => {
            return index.bucket === this.bucketName;
        });

        return indexStatuses;
    }

    /**
     * @return {Promise<array>} List of couchbase indexes in the bucket
     */
    async getIndexes() {
        let indexes = await this.manager.getAllIndexes(this.bucketName);

        // SDK 3 changed from index_key to indexKey and is_primary to isPrimary,
        // but this is confusing since our index definitions match the REST
        // response format with underscores. Therefore, adjust to match.
        indexes = indexes.map((index) => ({
            ...index,
            index_key: index.indexKey,
            is_primary: index.isPrimary,
        }));

        // Get additional info from the index status API
        let statuses = await this.getIndexStatuses();

        // Apply hosts from index status API to index information
        statuses.forEach((status) => {
            // remove (replica X) from the end of the index name
            let indexName = /^([^\s]*)/.exec(status.index)[1];

            let index = indexes.find((index) => index.name === indexName);
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
            }
        });

        return indexes;
    }

    /**
     * Creates an index based on an index definition
     * @param {string} statement N1QL query statement to create the index
     * @return {Promise}
     */
    createIndex(statement) {
        return this.cluster.query(statement);
    }

    /**
     * Moves index replicas been nodes
     * @param {string} indexName
     * @param {array.string} nodes
     * @return {Promise}
     */
    moveIndex(indexName, nodes) {
        let statement = 'ALTER INDEX ' +
            `\`${this.bucketName}\`.\`${indexName}\`` +
            ' WITH ';
        statement += JSON.stringify({
            action: 'move',
            nodes: nodes,
        });

        return this.cluster.query(statement);
    }

    /**
     * Builds any outstanding deferred indexes on the bucket
     * @return {Promise} Promise triggered once build is started (not completed)
     */
    async buildDeferredIndexes() {
        // Workaround for https://issues.couchbase.com/browse/JSCBC-771, we must build ourselves

        let indices = await this.manager.getAllIndexes(this.bucketName);

        let deferredList = [];
        for (let i = 0; i < indices.length; ++i) {
            let index = indices[i];

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
     * @param {number} [timeoutMilliseconds] Null or 0 for no timeout
     * @param {tickHandler} [tickHandler] Tick approx every 10 seconds
     * @param {object} [thisObj] Object to be this for tickHandler
     * @return {Promise}
     */
    async waitForIndexBuild(timeoutMilliseconds, tickHandler, thisObj) {
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
            let indexes = await this.getIndexes();

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
     *
     * @param {string} indexName
     * @param {*} options
     * @return {Promise}
     */
    dropIndex(indexName, options) {
        return this.manager.dropIndex(this.bucketName, indexName, options);
    }

    /**
     * Gets the version of the cluster
     *
     * @return {Promise.Version}
     */
    async getClusterVersion() {
        const resp = await this.manager._http.request({
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

        let poolData = JSON.parse(resp.body.toString());
        let minCompatibility = poolData.nodes.reduce(
            (accum, value) => {
                if (value.clusterCompatibility < accum) {
                    accum = value.clusterCompatibility;
                }

                return accum;
            }, 65535 * 65536);

        let clusterCompatibility = minCompatibility < 65535 * 65536 ?
            minCompatibility :
            0;

        return {
            major: Math.floor(clusterCompatibility / 65536),
            minor: clusterCompatibility & 65535,
        };
    }

    /**
     * Uses EXPLAIN to get a query plan for a statement
     * @param  {string} statement
     * @return {*}
     */
    async getQueryPlan(statement) {
        statement = 'EXPLAIN ' + statement;

        let explain = await this.cluster.query(statement);

        let plan = explain.rows[0].plan;

        if (plan && plan.keys) {
            // Couchbase 5.0 started nesting within expr property
            // so normalize the returned object
            plan.keys = plan.keys.map((key) =>
                isString(key) ? {expr: key} : key);
        }

        return plan;
    }
}
