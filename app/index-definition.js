import _ from 'lodash';
import {IndexDefinitionBase} from './index-definition-base';
import {CreateIndexMutation} from './create-index-mutation';
import {UpdateIndexMutation} from './update-index-mutation';
import {DropIndexMutation} from './drop-index-mutation';
import {MoveIndexMutation} from './move-index-mutation';
import {FeatureVersions} from './feature-versions';

/**
 * @typedef LifecycleHash
 * @property {?boolean} drop
 */

/**
 * @typedef PartitionHash
 * @property {!array.string} exprs
 * @property {?string} strategy
 */

 /**
 * @typedef DefinitionBase
 * @abstract
 * @property {?boolean} is_primary
 * @property {?array.string | string} index_key
 * @property {?string} condition
 * @property {?PartitionHash} partition
 * @property {?boolean} manual_replica
 * @property {?number} num_replica
 * @property {?array.string} nodes
 * @property {?boolean} retain_deleted_xattr
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
 * @property {?string} partition
 * @property {?boolean} is_primary
 * @property {?number} num_replica
 * @property {?array.string} nodes
 */

 /**
  * @typedef MutationContext
  * @property {array.CouchbaseIndex} currentIndexes
  * @property {?{major: number, minor: number}} clusterVersion
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
 * Validators for the incoming index properties.
 */
export const IndexValidators = {
    is_primary: function(val) {
        if (val !== undefined && !_.isBoolean(val)) {
            throw new Error('is_primary must be a boolean');
        }
    },
    index_key: function(val) {
        if (val === undefined) {
            return;
        }

        if (!_.isArrayLike(val)) {
            val = [val];
        }

        for (let v of val) {
            if (!_.isString(v)) {
                throw new Error(
                    'index_key must be a string or array of strings');
            }
        }
    },
    condition: function(val) {
        if (val !== undefined && !_.isString(val)) {
            throw new Error('condition must be a string');
        }
    },
    partition: function(val) {
        if (val === undefined) {
            return;
        }

        if (!val.exprs || !_.isObjectLike(val.exprs)) {
            throw new Error('Invalid partition');
        }

        _.forOwn(val.exprs, (v) => {
            if (!_.isString(v)) {
                throw new Error('Invalid partition');
            }
        });
    },
    nodes: function(val) {
        if (val !== undefined) {
            if (!_.isArrayLike(val)) {
                throw new Error('nodes must be an array of strings');
            }

            val.forEach((v) => {
                if (!_.isString(v)) {
                    throw new Error(
                        'nodes must be an array of strings');
                }
            });
        }
    },
    manual_replica: function(val) {
        if (val !== undefined && !_.isBoolean(val)) {
            throw new Error('manual_replica must be a boolean');
        }
    },
    num_replica: function(val) {
        if (val !== undefined && !_.isNumber(val)) {
            throw new Error('num_replica must be a number');
        }
    },
    retain_deleted_xattr: function(val) {
        if (val !== undefined && !_.isBoolean(val)) {
            throw new Error('retain_deleted_xattr must be a boolean');
        }
    },
    lifecycle: function(val) {
        if (val !== undefined && !_.isObjectLike(val)) {
            throw new Error('lifecycle is invalid');
        }
    },
    post_validate: function() {
        if (!this.is_primary) {
            if (!this.index_key || this.index_key.length === 0) {
                throw new Error('index_key must include at least one key');
            }
        } else {
            if (this.index_key && this.index_key.length > 0) {
                throw new Error('index_key is not allowed for a primary index');
            }

            if (this.condition) {
                throw new Error('condition is not allowed for a primary index');
            }
        }

        if (this.partition && this.manual_replica) {
            throw new Error(
                'manual_replica is not supported on partioned indexes');
        }

        if (!this.partition && this.nodes) {
            // Validate nodes and num_replica values
            if (this.nodes.length !== this.num_replica + 1) {
                throw new Error('mismatch between num_replica and nodes');
            }
        }
    },
};

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
            _.compact([val]) :
            Array.from(val),
    condition: (val) => val || '',
    partition: function(val) {
        // For overrides, ignore undefined
        // But clear the entire value if null

        if (!_.isUndefined(val)) {
            if (!val) {
                this.partition = undefined;
            } else {
                if (!this.partition) {
                    this.partition = {};
                }

                _.extend(this.partition, val);
            }
        }
    },
    nodes: function(val) {
        this.nodes = val;

        // for partitioned index, num_replica and nodes
        // are decoupled so skip setting num_replica
        if (val && val.length && !this.partition) {
            this.num_replica = val.length-1;
        }
    },
    manual_replica: (val) => !!val,
    num_replica: function(val) {
        if (!this.partition) {
            return val || (this.nodes ? this.nodes.length-1 : 0);
        } else {
            // for partitioned index, num_replica and nodes
            // are decoupled so skip nodes check
            return val || 0;
        }
    },
    retain_deleted_xattr: (val) => !!val,
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
 * @property {?PartitionHash} partition
 * @property {!boolean} manual_replica
 * @property {!number} num_replica
 * @property {?array.string} nodes
 * @property {!boolean} retain_deleted_xattr
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
        IndexValidators.post_validate.call(this);
    }

    /**
     * Gets the required index mutations, if any, to sync this definition
     *
     * @param  {MutationContext} context
     * @yields {IndexMutation}
     */
    * getMutations(context) {
        this.normalizeNodeList(context.currentIndexes);

        let mutations = [];

        if (!this.manual_replica) {
            mutations.push(...this.getMutation(context));
        } else {
            for (let i=0; i<=this.num_replica; i++) {
                mutations.push(...this.getMutation(context, i));
            }

            if (!this.is_primary) {
                // Handle dropping replicas if the count is lowered
                for (let i=this.num_replica+1; i<=10; i++) {
                    mutations.push(...this.getMutation(
                        context, i, true));
                }
            }
        }

        IndexDefinition.phaseMutations(mutations);

        yield* mutations;
    }

    /**
     * @private
     * @param  {MutationContext} context
     * @param  {?number} replicaNum
     * @param  {?boolean} forceDrop Always drop, even if lifecycle.drop = false.
     *     Used for replicas.
     * @yields {IndexMutation}
     */
    * getMutation(context, replicaNum, forceDrop) {
        let suffix = !replicaNum ?
            '' :
            `_replica${replicaNum}`;

        let currentIndex = context.currentIndexes.find((index) => {
            return this.isMatch(index, suffix);
        });

        let drop = forceDrop || this.lifecycle.drop;

        if (!currentIndex) {
            // Index isn't found
            if (!drop) {
                yield new CreateIndexMutation(this, this.name + suffix,
                    this.getWithClause(replicaNum));
            }
        } else if (drop) {
            yield new DropIndexMutation(this, currentIndex.name);
        } else if (!this.is_primary && this.requiresUpdate(currentIndex)) {
            yield new UpdateIndexMutation(this, this.name + suffix,
                this.getWithClause(replicaNum),
                currentIndex);
        } else if (!this.manual_replica &&
            !_.isUndefined(currentIndex.num_replica) &&
            this.num_replica !== currentIndex.num_replica) {
            // Number of replicas changed for an auto replica index
            // We must drop and recreate.

            yield new UpdateIndexMutation(this, this.name + suffix,
                this.getWithClause(replicaNum),
                currentIndex);
        } else if (this.nodes && currentIndex.nodes) {
            // Check for required node changes
            currentIndex.nodes.sort();

            if (this.manual_replica) {
                if (this.nodes[replicaNum] !== currentIndex.nodes[0]) {
                    yield new UpdateIndexMutation(this, this.name + suffix,
                        this.getWithClause(replicaNum),
                        currentIndex);
                }
            } else {
                if (!_.isEqual(this.nodes, currentIndex.nodes)) {
                    yield new MoveIndexMutation(this, this.name + suffix,
                        !FeatureVersions.alterIndex(context.clusterVersion));
                }
            }
        }
    }

    /**
     * @private
     * @param  {?number} replicaNum
     * @return {Object<string, *>}
     */
    getWithClause(replicaNum) {
        let withClause;

        if (!this.manual_replica) {
            withClause = {
                nodes: this.nodes ? this.nodes.map(ensurePort) : undefined,
                num_replica: this.num_replica,
            };
        } else {
            withClause = {
                nodes: this.nodes && [ensurePort(this.nodes[replicaNum])],
            };
        }

        if (this.retain_deleted_xattr) {
            withClause = {
                ...withClause,
                retain_deleted_xattr: true,
            };
        }

        return withClause;
    }

    /**
     * Formats the PartitionHash as a string
     *
     * @return {string}
     */
    getPartitionString() {
        if (!this.partition) {
            return '';
        }

        let str = `${(this.partition.strategy || 'HASH').toUpperCase()}(`;
        str += this.partition.exprs.join();
        str += ')';

        return str;
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
     * Tests to see if a Couchbase index requires updating,
     * ignoring node changes which are handled separately.
     *
     * @param {CouchbaseIndex} index
     * @return {boolean}
     */
    requiresUpdate(index) {
        return (index.condition || '') !== this.condition ||
            !_.isEqual(index.index_key, this.index_key) ||
            (index.partition || '') !== this.getPartitionString() ||
            !!index.retain_deleted_xattr !== this.retain_deleted_xattr;
    }

    /**
     * Normalizes the index definition using Couchbase standards
     * for condition and index_key.
     *
     * @param  {IndexManager} manager
     */
    async normalize(manager) {
        if (this.is_primary) {
            // Not required for primary index
            return;
        }

        // Calling explain for creating an index returns a plan
        // in which the keys and condition have been normalizaed for us
        // However, we must use a special index name to prevent rejection
        // due to name conflicts.

        let statement =
            this.getCreateStatement(manager.bucketName, '__cbim_normalize');

        let plan;
        try {
            plan = await manager.getQueryPlan(statement);
        } catch (e) {
            throw new Error(
                `Invalid index definition for ${this.name}: ${e.message}`);
        }

        this.index_key = (plan.keys || []).map((key) =>
            key.expr + (key.desc ? ' DESC' : ''));
        this.condition = plan.where || '';
        this.partition = plan.partition;
    }

    /**
     * Formats a CREATE INDEX query which makes this index
     *
     * @param {string} bucketName
     * @param {string} [indexName]
     * @param {Object<string, *>} [withClause]
     * @return {string}
     */
    getCreateStatement(bucketName, indexName, withClause) {
        if (withClause === undefined && !_.isString(indexName)) {
            withClause = indexName;
            indexName = undefined;
        }

        indexName = ensureEscaped(indexName || this.name);

        let statement;
        if (this.is_primary) {
            statement = `CREATE PRIMARY INDEX ${indexName}`;
            statement += ` ON ${ensureEscaped(bucketName)}`;
        } else {
            statement = `CREATE INDEX ${indexName}`;
            statement += ` ON ${ensureEscaped(bucketName)}`;
            statement += ` (${this.index_key.join(', ')})`;
        }

        if (this.partition) {
            statement +=
                ` PARTITION BY ${this.getPartitionString()}`;
        }

        if (!this.is_primary) {
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
     * Apply phases to the collection of index mutations
     *
     * @param {array.IndexMutation} mutations
     */
    static phaseMutations(mutations) {
        // All creates should be in phase one
        // All updates should be in one phase each, after creates
        // Everything else should be in the last phase
        // This is relative to each index definition only

        let nextPhase = 1;
        for (let mutation of mutations) {
            if (mutation instanceof CreateIndexMutation) {
                nextPhase = 2;
                mutation.phase = 1;
            }
        }

        for (let mutation of mutations) {
            if (mutation instanceof UpdateIndexMutation) {
                mutation.phase = nextPhase;
                nextPhase += 1;
            }
        }

        for (let mutation of mutations) {
            if (!(mutation instanceof CreateIndexMutation) &&
                !(mutation instanceof UpdateIndexMutation)) {
                mutation.phase = nextPhase;
            }
        }
    }

    /**
     * @private
     * Ensures that the node list has port numbers and is sorted in the same
     * order as the current indexes.  This allows easy matching of existing
     * node assignments, reducing reindex load due to minor node shifts.
     *
     * @param {array.CouchbaseIndex} currentIndexes
     */
    normalizeNodeList(currentIndexes) {
        if (!this.nodes) {
            return;
        }

        this.nodes = this.nodes.map(ensurePort);
        this.nodes.sort();

        if (this.manual_replica) {
            // We only care about specific node mappings for manual replicas
            // For auto replicas we let Couchbase handle it

            let newNodeList = [];
            let unused = _.clone(this.nodes);

            for (let replicaNum=0; replicaNum<=this.num_replica; replicaNum++) {
                let suffix = !replicaNum ?
                    '' :
                    `_replica${replicaNum}`;

                let index = currentIndexes.find((index) => {
                    return this.isMatch(index, suffix);
                });

                if (index && index.nodes) {
                    let unusedIndex = unused.findIndex(
                        (name) => name === index.nodes[0]);

                    if (unusedIndex >= 0) {
                        newNodeList[replicaNum] =
                            unused.splice(unusedIndex, 1)[0];
                    }
                }
            }

            // Fill in the remaining nodes that didn't have a match
            for (let replicaNum=0; replicaNum<=this.num_replica; replicaNum++) {
                if (!newNodeList[replicaNum]) {
                    newNodeList[replicaNum] =
                        unused.shift();
                }
            }

            this.nodes = newNodeList;
        }
    }
}
