import _ from 'lodash';
import {IndexDefinitionBase} from './index-definition-base';
import {CreateIndexMutation} from './create-index-mutation';
import {UpdateIndexMutation} from './update-index-mutation';
import {DropIndexMutation} from './drop-index-mutation';

/**
 * @typedef LifecycleHash
 * @property {?boolean} drop
 */

 /**
 * @typedef DefinitionBase
 * @abstract
 * @property {?boolean} is_primary
 * @property {?array.string | string} index_key
 * @property {?string} condition
 * @property {?boolean} manual_replica
 * @property {?number} num_replica
 * @property {?array.string} nodes
 * @property {?LifecycleHash} lifecycle
 */

/**
 * @typedef IndexDefinitionHash
 * @extends DefinitionBase
 * @property {!string} name
 */

 /**
 * @typedef OverrideHash
 * @extends DefinitionBase
 * @property {?string | function} post_process
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
 * @type Object<string, function(*)>
 *
 * Map of processing functions to handle hash keys.
 * "this" when the function is called will be the IndexDefinition.
 * If a value is returned, it is assigned to the key.
 * If "undefined" is returned, it assumed that the handler
 * processed the value completely.
 */
const keys = {
    is_primary: (val) => !!val,
    index_key: (val) => !val ? [] :
        _.isString(val) ?
            _.compact([normalizeIndexKey(val)]) :
            Array.from(val).map(normalizeIndexKey),
    condition: (val) => IndexDefinition.normalizeCondition(val),
    nodes: function(val) {
        this.nodes = val;

        if (val && val.length) {
            this.num_replica = val.length-1;
        }
    },
    manual_replica: (val) => !!val,
    num_replica: function(val) {
        return val || (this.nodes ? this.nodes.length-1 : 0);
    },
    lifecycle: function(val) {
        if (!this.lifecycle) {
            this.lifecycle = {};
        }

        if (val) {
            _.extend(this.lifecycle, val);
        }
    },
    post_process: function(val) {
        let fn;

        if (_.isFunction(val)) {
            fn = (require, process) => {
                val.call(this);
            };
        } else if (_.isString(val)) {
            fn = new Function('require', 'process', val);
        }

        if (fn) {
            fn.call(this, require, process);
        }
    },
};

/**
 * Represents an index
 * @property {!string} name
 * @property {!boolean} is_primary
 * @property {!array.string} index_key
 * @property {?string} condition
 * @property {!boolean} manual_replica
 * @property {!number} num_replica
 * @property {?array.string} nodes
 * @property {!LifecycleHash} lifecycle
 */
export class IndexDefinition extends IndexDefinitionBase {
     /**
     * Creates a new IndexDefinition from a simple object map
     *
     * @param  {IndexDefinitionHash} hashMap
     */
    constructor(hashMap) {
        super(hashMap);

        this.applyOverride(hashMap, true);
    }

    /**
     * Creates a new IndexDefinition from a simple object map
     *
     * @param  {IndexDefinitionHash} obj
     * @return {IndexDefinition}
     */
    static fromObject(obj) {
        return new IndexDefinition(obj);
    }

    /**
     * Apply overrides to the index definition
     *
     * @param {*} override
     * @param {?boolean} applyMissing Overwrite values even if they are
     *     missing from the overrides object
     */
    applyOverride(override, applyMissing) {
        // Validate the overrides
        if (override.nodes && (override.num_replica >= 0)) {
            if (override.nodes.length !== override.num_replica + 1) {
                throw new Error('mismatch between num_replica and nodes');
            }
        }

        // Process the keys
        Object.keys(keys).forEach((key) => {
            if (applyMissing || override[key] !== undefined) {
                let result = keys[key].call(this, override[key]);

                if (result !== undefined) {
                    this[key] = result;
                }
            }
        });

        // Validate the resulting defintion
        if (!this.is_primary) {
            if (this.index_key.length === 0) {
                throw new Error('index_key must include at least one key');
            }
        } else {
            if (this.index_key.length > 0) {
                throw new Error('index_key is not allowed for a primary index');
            }

            if (this.condition) {
                throw new Error('condition is not allowed for a primary index');
            }
        }
    }

    /**
     * Gets the required index mutations, if any, to sync this definition
     *
     * @param  {array.CouchbaseIndex} currentIndexes
     * @yields {IndexMutation}
     */
    * getMutations(currentIndexes) {
        if (!this.manual_replica) {
            let mutation = this.getMutation(currentIndexes);
            if (mutation) {
                yield mutation;
            }
        } else {
            for (let i=0; i<=this.num_replica; i++) {
                let mutation = this.getMutation(currentIndexes, i);
                if (mutation) {
                    yield mutation;
                }
            }

            if (!this.is_primary) {
                // Handle dropping replicas if the count is lowered
                for (let i=this.num_replica+1; i<=10; i++) {
                    let mutation = this.getMutation(
                        currentIndexes, i, true);

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
     * @param  {?boolean} forceDrop Always drop, even if lifecycle.drop = false.
     *     Used for replicas.
     * @return {?IndexMutation}
     */
    getMutation(currentIndexes, replicaNum, forceDrop) {
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
                    this.getWithClause(replicaNum));
            }
        } else if (drop) {
            return new DropIndexMutation(this, currentIndex.name);
        } else if (!this.is_primary && this.requiresUpdate(currentIndex)) {
            return new UpdateIndexMutation(this, this.name + suffix,
                this.getWithClause(replicaNum),
                currentIndex);
        }

        return undefined;
    }

    /**
     * @private
     * @param  {?number} replicaNum
     * @return {Object<string, *>}
     */
    getWithClause(replicaNum) {
        if (!this.manual_replica) {
            return {
                nodes: this.nodes ? this.nodes.map(ensurePort) : undefined,
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
        return (index.condition || '') !== this.condition
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
            return '';
        }

        return condition.replace(/'([^']*)'/g, '"$1"');
    }
}
