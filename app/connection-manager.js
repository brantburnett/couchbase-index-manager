import {Cluster, PasswordAuthenticator, ClassicAuthenticator} from 'couchbase';
import {IndexManager} from './index-manager';

/**
 * @typedef ConnectionInfo
 * @property {string} cluster URI to connect to the cluster
 * @property {string} username
 * @property {string} password
 * @property {string} bucketName
 * @property {boolean} disableRbac
 * @property {?string} bucketPassword For 4.x clusters with secure buckets
 */

/**
 * @private
 * Wraps a process in a Couchbase connection with IndexManager
 */
export class ConnectionManager {
    /**
     * @param {ConnectionInfo} connectionInfo
     */
    constructor(connectionInfo) {
        this.connectionInfo = connectionInfo;
    }

    /**
     * Runs the process
     *
     * @param {function(IndexManager): Promise<*>} handler
     * @return {Promise<*>}
     */
    async execute(handler) {
        let manager = this.bootstrap();

        let result = await handler(manager);

        this.close();

        return result;
    }

    /**
     * @private
     * Bootstraps the Couchbase connection.
     *
     * @return {IndexManager}
     */
    bootstrap() {
        this.cluster = new Cluster(this.connectionInfo.cluster);

        if (this.connectionInfo.disableRbac) {
            this.cluster.authenticate(new ClassicAuthenticator(
                {},
                this.connectionInfo.username,
                this.connectionInfo.password
            ));
        } else {
            this.cluster.authenticate(new PasswordAuthenticator(
                this.connectionInfo.username,
                this.connectionInfo.password));
        }

        this.bucket = this.cluster.openBucket(
            this.connectionInfo.bucketName,
            this.connectionInfo.bucketPassword);

        return new IndexManager(this.connectionInfo.bucketName, this.bucket,
            this.cluster);
    }

    /**
     * @private
     * Closes the Couchbase connection.
    */
    close() {
        this.bucket.disconnect();
    }
}
