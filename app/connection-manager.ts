import { Bucket, Cluster, connect } from 'couchbase';
import { IndexManager } from './index-manager';

export interface ConnectionInfo {
    cluster: string;
    username: string;
    password: string;
    bucketName: string;
}

/**
 * @private
 * Wraps a process in a Couchbase connection with IndexManager
 */
export class ConnectionManager {
    private cluster?: Cluster;
    private bucket?: Bucket;

    constructor(private connectionInfo: ConnectionInfo) { }

    /**
     * Runs the process
     */
    async execute<T>(handler: (manager: IndexManager) => T): Promise<T> {
        const manager = await this.bootstrap();

        const result = await handler(manager);

        await this.close();

        return result;
    }

    /**
     * Bootstraps the Couchbase connection.
     */
    private async bootstrap(): Promise<IndexManager> {
        this.cluster = await connect(this.connectionInfo.cluster, {
            username: this.connectionInfo.username,
            password: this.connectionInfo.password,
        });

        this.bucket = this.cluster.bucket(this.connectionInfo.bucketName);

        return new IndexManager(this.bucket, this.cluster);
    }

    /**
     * Closes the Couchbase connection.
    */
    private async close(): Promise<void> {
        await this.cluster?.close();

        this.cluster = undefined;
        this.bucket = undefined;
    }
}
