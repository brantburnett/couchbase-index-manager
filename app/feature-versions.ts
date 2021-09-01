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
     * Tests for ALTER INDEX replica_count compatibility
     */
    static alterIndexReplicaCount(version: Version | null | undefined): boolean {
        return !!version &&
            (version.major > 6 ||
            (version.major == 6 && version.minor >= 5));
    }
}
