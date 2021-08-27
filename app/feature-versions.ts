import { PartitionStrategy } from "./configuration";

export interface Version {
    major: number;
    minor: number;
}

/**
 * Tests for compatibility with various features,
 * given a cluster version from clusterCompatibility.
 */
export class FeatureVersions {
    /**
     * Tests for ALTER INDEX compatibility
     */
    static alterIndex(version: Version): boolean {
        return version &&
            (version.major > 5 ||
            (version.major == 5 && version.minor >= 5));
    }

    /**
     * Tests for ALTER INDEX replica_count compatibility
     */
    static alterIndexReplicaCount(version: Version): boolean {
        return version &&
            (version.major > 6 ||
            (version.major == 6 && version.minor >= 5));
    }

    /**
     * Tests for PARTITION BY compatibility
     */
    static partitionBy(version: Version, strategy: string): boolean {
        if (strategy.toUpperCase() !== PartitionStrategy.Hash) {
            return false;
        }

        return version &&
            (version.major > 5 ||
            (version.major == 5 && version.minor >= 5));
    }

    /**
     * Tests for automatic replica compatibility
     */
    static autoReplicas(version: Version): boolean {
        return version && version.major >= 5;
    }
}
