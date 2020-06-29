 /**
  * @typedef Version
  * @property {number} major
  * @property {number} minor
  */

/**
 * Tests for compatibility with various features,
 * given a cluster version from clusterCompatibility.
 */
export class FeatureVersions {
    /**
     * Tests for ALTER INDEX compatibility
     *
     * @param  {Version} version
     * @return {boolean}
     */
    static alterIndex(version) {
        return version &&
            (version.major > 5 ||
            (version.major == 5 && version.minor >= 5));
    }

    /**
     * Tests for ALTER INDEX replica_count compatibility
     *
     * @param  {Version} version
     * @return {boolean}
     */
    static alterIndexReplicaCount(version) {
        return version &&
            (version.major > 6 ||
            (version.major == 6 && version.minor >= 5));
    }

    /**
     * Tests for PARTITION BY compatibility
     *
     * @param  {Version} version
     * @param  {string} strategy Partition strategy, i.e. 'HASH'
     * @return {boolean}
     */
    static partitionBy(version, strategy) {
        if (strategy.toUpperCase() !== 'HASH') {
            return false;
        }

        return version &&
            (version.major > 5 ||
            (version.major == 5 && version.minor >= 5));
    }

    /**
     * Tests for automatic replica compatibility
     *
     * @param  {Version} version
     * @return {boolean}
     */
    static autoReplicas(version) {
        return version && version.major >= 5;
    }
}
