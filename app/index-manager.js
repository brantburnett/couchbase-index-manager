import {N1qlQuery} from 'couchbase';
import {extend} from 'lodash';

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

 /** Helper function to read HTTP responses
  *
  * @param {httpResponse} callback Callback to receive the response
  * @return {function} HTTP response handler to attach to the reponse event
  */
function _respRead(callback) {
    return function(resp) {
      resp.setEncoding('utf8');
      let strBuffer = '';
      resp.on('data', function(data) {
        strBuffer += data;
      });
      resp.on('end', function() {
        callback(null, resp, strBuffer);
      });
      resp.on('error', function(err) {
        callback(err, resp, null);
      });
    };
}

/** Extension methods injected into BucketManager */
const extensions = {
    cbim_getIndexStatus: function(callback) {
        this._mgmtRequest('indexStatus', 'GET', (err, httpReq) => {
            if (err) {
                return callback(err, null);
            }

            httpReq.on('error', callback);
            httpReq.on('response', _respRead((err, resp, data) => {
                if (err) {
                    return callback(err);
                }

                if (resp.statusCode !== 200) {
                    let errData = null;
                    try {
                        errData = JSON.parse(data);
                    } catch (e) {
                        // ignore
                    }

                    if (!errData) {
                        callback(new Error(
                            'operation failed (' + resp.statusCode +')'), null);
                        return;
                    }

                    callback(new Error(errData.reason), null);
                    return;
                }

                let indexStatusData = JSON.parse(data);
                let indexStatuses = indexStatusData.indexes.filter((index) => {
                    return index.bucket === this._bucket._name;
                });

                callback(null, indexStatuses);
            }));
            httpReq.end();
        });
    },
};

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

        extend(this.manager, extensions);
    }

    /**
     * @return {Promise<array>} List of couchbase indexes in the bucket
     */
    async getIndexes() {
        let indexes = await new Promise((resolve, reject) => {
            this.manager.getIndexes((err, indexes) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(indexes);
                }
            });
        });

        // Get additional info from the index status API
        let statuses = await new Promise((resolve, reject) => {
            this.manager.cbim_getIndexStatus((err, statuses) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(statuses);
                }
            });
        });

        // Apply hosts from index status API to index information
        statuses.forEach((status) => {
            let index = indexes.find((index) => index.name === status.index);
            if (index) {
                index.nodes = status.hosts;
                index.num_replica = status.hosts.length - 1;
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
     * Moves index replicas been nodes
     * @param {string} indexName
     * @param {array.string} nodes
     * @return {Promise}
     */
    moveIndex(indexName, nodes) {
        return new Promise((resolve, reject) => {
            let statement = `ALTER INDEX \`${indexName}\` WITH `;
            statement += JSON.stringify({
                action: 'move',
                nodes: nodes,
            });

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
