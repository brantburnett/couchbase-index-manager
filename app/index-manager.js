import {N1qlQuery} from 'couchbase';

const WAIT_TICK_INTERVAL = 10000; // in milliseconds

/**
 * @callback tickHandler
 * @param {number} milliseconds Milliseconds since the build wait was started
 */

/**
 * Manages Couchbase indexes
 *
 * @property {!string} bucketName
 * @property {!boolean} is4XCluster
 */
export class IndexManager {
    /**
     * @param {string} bucketName
     * @param {CouchbaseBucket} bucket
     * @param {boolean} is4XCluster
     */
    constructor(bucketName, bucket, is4XCluster) {
        this.bucketName = bucketName;
        this.bucket = bucket;
        this.manager = bucket.manager();
        this.is4XCluster = is4XCluster;
    }

    /**
     * @return {Promise<array>} List of couchbase indexes in the bucket
     */
    getIndexes() {
        return new Promise((resolve, reject) => {
            this.manager.getIndexes((err, indexes) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(indexes);
                }
            });
        });
    }

    /**
     * Creates an index based on an index definition
     * @param {string} statement N1QL query statement to create the index
     * @return {Promise}
     */
    createIndex(statement) {
        return new Promise((resolve, reject) => {
            this.bucket.query(N1qlQuery.fromString(statement), (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Builds any outstanding deferred indexes on the bucket
     * @return {Promise} Promise triggered once build is started (not completed)
     */
    buildDeferredIndexes() {
        return new Promise((resolve, reject) => {
            this.manager.buildDeferredIndexes((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
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
        return new Promise((resolve, reject) => {
            this.manager.dropIndex(indexName, options, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
}
