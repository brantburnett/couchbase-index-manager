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
     * Tests for automatic replica compatibility
     *
     * @param  {Version} version
     * @return {boolean}
     */
    static autoReplicas(version) {
        return version && version.major >= 5;
    }
}
