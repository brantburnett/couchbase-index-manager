import {N1qlQuery} from 'couchbase';
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
     * @param {Cluster} cluster
     */
    constructor(bucketName, bucket, cluster) {
        this.bucketName = bucketName;
        this.bucket = bucket;
        this.manager = bucket.manager();
        this.clusterManager = cluster.manager();
    }

    /**
     * @private
     * Gets index statuses for the bucket via the cluster manager
     *
     * @return {Promise.array}
     */
    getIndexStatuses() {
        return new Promise((resolve, reject) => {
            let httpReq = this.clusterManager._mgmtRequest(
                'indexStatus', 'GET');

            httpReq.on('error', reject);
            httpReq.on('response', _respRead((err, resp, data) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (resp.statusCode !== 200) {
                    let errData = null;
                    try {
                        errData = JSON.parse(data);
                    } catch (e) {
                        // ignore
                    }

                    if (!errData) {
                        reject(new Error(
                            'operation failed (' + resp.statusCode +')'));
                        return;
                    }

                    reject(new Error(errData.reason));
                    return;
                }

                let indexStatusData = JSON.parse(data);
                let indexStatuses = indexStatusData.indexes.filter((index) => {
                    return index.bucket === this.bucketName;
                });

                resolve(indexStatuses);
            }));
            httpReq.end();
        });
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
                index.nodes.push(...status.hosts);

                index.num_replica = index.nodes.length - 1;
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
            let statement = 'ALTER INDEX ' +
                `\`${this.bucketName}\`.\`${indexName}\`` +
                ' WITH ';
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

    /**
     * Gets the version of the cluster
     *
     * @return {Promise.Version}
     */
    async getClusterVersion() {
        // Get additional info from the index status API
        let clusterCompatibility = await new Promise((resolve, reject) => {
            let httpReq = this.clusterManager._mgmtRequest(
                'pools/default', 'GET');

            httpReq.on('error', reject);
            httpReq.on('response', _respRead((err, resp, data) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (resp.statusCode !== 200) {
                    let errData = null;
                    try {
                        errData = JSON.parse(data);
                    } catch (e) {
                        // ignore
                    }

                    if (!errData) {
                        reject(new Error(
                            'operation failed (' + resp.statusCode +')'),
                            null);
                        return;
                    }

                    reject(new Error(errData.reason));
                    return;
                }

                let poolData = JSON.parse(data);
                let minCompatibility = poolData.nodes.reduce(
                    (accum, value) => {
                        if (value.clusterCompatibility < accum) {
                            accum = value.clusterCompatibility;
                        }

                        return accum;
                    }, 65535 * 65536);

                resolve(minCompatibility < 65535 * 65536 ?
                    minCompatibility :
                    0);
            }));
            httpReq.end();
        });

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

        let explain = await new Promise((resolve, reject) => {
            let query = N1qlQuery.fromString(statement);
            this.bucket.query(query, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        });

        let plan = explain[0].plan;

        if (plan && plan.keys) {
            // Couchbase 5.0 started nesting within expr property
            // so normalize the returned object
            plan.keys = plan.keys.map((key) =>
                isString(key) ? {expr: key} : key);
        }

        return plan;
    }
}
