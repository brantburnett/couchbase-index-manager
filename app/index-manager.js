import {N1qlQuery} from 'couchbase';

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
     * @param {?number} timeoutMilliseconds Null or 0 for no timeout
     * @return {Promise}
     */
    async waitForIndexBuild(timeoutMilliseconds) {
        const startTime = Date.now();

        while (!timeoutMilliseconds ||
            (Date.now() - startTime < timeoutMilliseconds)) {
            let indexes = await this.getIndexes();

            if (!indexes.find((p) => p.state !== 'online')) {
                // All indexes are online
                return true;
            }

            await new Promise((resolve) => setTimeout(resolve, 1000));
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
