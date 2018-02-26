import _ from 'lodash';
import {CreateIndexMutation} from './create-index-mutation';
import {UpdateIndexMutation} from './update-index-mutation';
import {DropIndexMutation} from './drop-index-mutation';

/**
 * @typedef LifecycleHash
 * @property {?boolean} drop
 */

/**
 * @typedef IndexDefinitionHash
 * @property {string} name
 * @property {?boolean} is_primary
 * @property {?array.string} index_key
 * @property {?string} condition
 * @property {?number} num_replica
 * @property {?array.string} nodes
 * @property {?LifecycleHash} lifecycle
 */

/**
 * @typedef CouchbaseIndex
 * @property {string} name
 * @property {array.string} index_key
 * @property {?string} condition
 * @property {?boolean} is_primary
 */

/**
 * Ensures that the N1QL identifier is escaped with backticks
 *
 * @param  {!string} identifier
 * @return {!string}
 */
function ensureEscaped(identifier) {
    if (!identifier.startsWith('`')) {
        return '`' + identifier.replace(/`/g, '``') + '`';
    } else {
        return identifier;
    }
}

/**
 * Ensures that the N1QL identifier is escaped with backticks, unless it's a
 *     function call or array subquery
 *
 * @param  {!string} identifier
 * @return {!string}
 */
function normalizeIndexKey(identifier) {
    identifier = identifier.trim().replace(/\s{2,}/g, ' ');

    if (identifier.match(/^(\(?\s*DISTINCT|ALL)\s*\(?\s*ARRAY|\(/i)) {
        // Contains parentheses or starts with ALL ARRAY or DISTINCT ARRAY
        // Don't escape
        return identifier;
    } else {
        return ensureEscaped(identifier);
    }
}

/**
 * Ensures that a server name has a port number appended, defaults to 8091
 * @param  {string} server
 * @return {string}
 */
function ensurePort(server) {
    if (server.match(/:\d+$/)) {
        return server;
    } else {
        return server + ':8091';
    }
}

/**
 * Represents an index
 * @property {!string} name
 * @property {!boolean} is_primary
 * @property {!array.string} index_key
 * @property {?string} condition
 * @property {!number} num_replica
 * @property {?array.string} nodes
 * @property {!LifecycleHash} lifecycle
 */
export class IndexDefinition {
    /**
     * Creates a new IndexDefinition from a simple object map
     *
     * @param  {IndexDefinitionHash} obj
     * @return {IndexDefinition}
     */
    static fromObject(obj) {
        let definition = new IndexDefinition();

        if (!obj.name || !_.isString(obj.name)) {
            throw new Error('Index definition does not have a \'name\'');
        }
        definition.name = obj.name;
        definition.is_primary = !!obj.is_primary;

        definition.index_key = !obj.index_key ?
            [] :
            _.isArray(obj.index_key) ?
                obj.index_key.map(normalizeIndexKey) :
                _.compact([normalizeIndexKey(obj.index_key)]);

        definition.condition =
            IndexDefinition.normalizeCondition(obj.condition);
        definition.lifecycle = obj.lifecycle || {};

        if (!definition.is_primary) {
            if (definition.index_key.length === 0) {
                throw new Error('index_key must include at least one key');
            }
        } else {
            if (definition.index_key.length > 0) {
                throw new Error('index_key is not allowed for a primary index');
            }

            if (definition.condition) {
                throw new Error('condition is not allowed for a primary index');
            }
        }

        if (obj.nodes && (obj.num_replica >= 0)) {
            if (obj.nodes.length !== obj.num_replica + 1) {
                throw new Error('mismatch between num_replica and nodes');
            }
        }

        definition.num_replica = obj.num_replica ||
            (obj.nodes ? obj.nodes.length - 1 : 0);
        definition.nodes = obj.nodes;

        return definition;
    }

    /**
     * Gets the required index mutations, if any, to sync this definition
     *
     * @param  {array.CouchbaseIndex} currentIndexes
     * @param  {?boolean} is4XCluster
     * @yields {IndexMutation}
     */
    * getMutations(currentIndexes, is4XCluster) {
        if (!is4XCluster) {
            let mutation = this.getMutation(currentIndexes);
            if (mutation) {
                yield mutation;
            }
        } else {
            for (let i=0; i<=this.num_replica; i++) {
                let mutation = this.getMutation(currentIndexes, i, true);
                if (mutation) {
                    yield mutation;
                }
            }

            if (!this.is_primary) {
                // Handle dropping replicas if the count is lowered
                for (let i=this.num_replica+1; i<=10; i++) {
                    let mutation = this.getMutation(
                        currentIndexes, i, true, true);

                    if (mutation) {
                        yield mutation;
                    }
                }
            }
        }
    }

    /**
     * @private
     * @param  {array.CouchbaseIndex} currentIndexes
     * @param  {?number} replicaNum
     * @param  {?boolean} is4XCluster
     * @param  {?boolean} forceDrop Always drop, even if lifecycle.drop = false.
     *     Used for replicas.
     * @return {?IndexMutation}
     */
    getMutation(currentIndexes, replicaNum, is4XCluster, forceDrop) {
        let suffix = !replicaNum ?
            '' :
            `_replica${replicaNum}`;

        let currentIndex = currentIndexes.find((index) => {
            return this.isMatch(index, suffix);
        });

        let drop = forceDrop || this.lifecycle.drop;

        if (!currentIndex) {
            // Index isn't found
            if (!drop) {
                return new CreateIndexMutation(this, this.name + suffix,
                    this.getWithClause(replicaNum, is4XCluster));
            }
        } else if (drop) {
            return new DropIndexMutation(this, currentIndex.name);
        } else if (!this.is_primary && this.requiresUpdate(currentIndex)) {
            return new UpdateIndexMutation(this, this.name + suffix,
                this.getWithClause(replicaNum, is4XCluster),
                currentIndex);
        }

        return undefined;
    }

    /**
     * @private
     * @param  {?number} replicaNum
     * @param  {?boolean} is4XCluster
     * @return {Object<string, *>}
     */
    getWithClause(replicaNum, is4XCluster) {
        if (!is4XCluster) {
            return {
                nodes: this.nodes.map(ensurePort),
                num_replica: this.num_replica,
            };
        } else {
            return {
                nodes: this.nodes && [ensurePort(this.nodes[replicaNum])],
            };
        }
    }

    /**
     * @private
     * Tests to see if a Couchbase index matches this definition
     *
     * @param  {CouchbaseIndex} index
     * @param  {?string} suffix Optional suffix to append
     * @return {boolean}
     */
    isMatch(index, suffix) {
        if (this.is_primary) {
            // Consider any primary index a match, regardless of name
            return index.is_primary;
        } else {
            return (
                ensureEscaped(this.name + (suffix || '')) ===
                ensureEscaped(index.name));
        }
    }

    /**
     * @private
     * Tests to see if a Couchbase index requires updating
     *
     * @param {CouchbaseIndex} index
     * @return {boolean}
     */
    requiresUpdate(index) {
        return index.condition !== this.condition
            || !_.isEqual(index.index_key, this.index_key);
    }

    /**
     * Formats a CREATE INDEX query which makes this index
     *
     * @param {string} bucketName
     * @param {?string} indexName
     * @param {?Object<string, *>} withClause
     * @return {string}
     */
    getCreateStatement(bucketName, indexName, withClause) {
        indexName = ensureEscaped(indexName || this.name);

        let statement;
        if (this.is_primary) {
            statement = `CREATE PRIMARY INDEX ${indexName}`;
            statement += ` ON ${ensureEscaped(bucketName)}`;
        } else {
            statement = `CREATE INDEX ${indexName}`;
            statement += ` ON ${ensureEscaped(bucketName)}`;
            statement += ` (${this.index_key.join(', ')})`;

            if (this.condition) {
                statement += ` WHERE ${this.condition}`;
            }
        }

        withClause = _.extend({}, withClause, {
            defer_build: true,
        });

        if (!withClause.num_replica) {
            // Don't include in the query string if not > 0
            delete withClause.num_replica;
        }

        if (!withClause.nodes || withClause.nodes.length === 0) {
            // Don't include an empty value
            delete withClause.nodes;
        }

        statement += ' WITH ' + JSON.stringify(withClause);

        return statement;
    }

    /**
     * @private
     * Limited subset of normalizations on conditions
     *
     * @param {string} condition
     * @return {string}
     */
    static normalizeCondition(condition) {
        if (!condition) {
            return condition;
        }

        return condition.replace(/'([^']*)'/g, '"$1"');
    }
}
