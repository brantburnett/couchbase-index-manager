import _ from 'lodash';
import { IndexDefinitionBase } from './index-definition-base';
import { CreateIndexMutation } from '../plan/create-index-mutation';
import { UpdateIndexMutation } from '../plan/update-index-mutation';
import { DropIndexMutation } from '../plan/drop-index-mutation';
import { MoveIndexMutation } from '../plan/move-index-mutation';
import { ResizeIndexMutation } from '../plan/resize-index-mutation';
import { FeatureVersions, Version } from '../feature-versions';
import { IndexValidators } from '../configuration/index-validation';
import { CouchbaseIndex, IndexManager, WithClause } from '../index-manager';
import { IndexConfiguration, IndexConfigurationBase, Lifecycle, Partition, PartitionStrategy, PostProcessHandler } from '../configuration';
import { IndexMutation } from '../plan/index-mutation';

export interface MutationContext {
    currentIndexes: CouchbaseIndex[];
    clusterVersion?: Version;
}

/**
 * Subset of fields returned on a query plan for CREATE INDEX
 */
interface IndexCreatePlan {
    keys: {
        expr: string
        desc: boolean;
    }[];
    where?: string;
    partition?: {
        exprs: string[];
        strategy: PartitionStrategy;
    }
}

/**
 * Ensures that the N1QL identifier is escaped with backticks
 */
function ensureEscaped(identifier: string): string {
    if (!identifier.startsWith('`')) {
        return '`' + identifier.replace(/`/g, '``') + '`';
    } else {
        return identifier;
    }
}

/**
 * Ensures that a server name has a port number appended, defaults to 8091
 */
function ensurePort(server: string): string {
    if (server.match(/:\d+$/)) {
        return server;
    } else {
        return server + ':8091';
    }
}

type KeyProcessor<T> = (this: IndexDefinition, val: any) => T | undefined;

type KeyProcessorSet = {
    [key in keyof IndexConfigurationBase]?: KeyProcessor<IndexConfigurationBase[key]>;
}

function processKey<K extends keyof IndexConfigurationBase>(index: IndexConfigurationBase, key: K,
    processor: KeyProcessor<IndexConfigurationBase[K]>, initialValue: any) {

    const result = processor.call(index, initialValue);

    if (result !== undefined) {
        index[key] = result;
    }
}

/**
 * Map of processing functions to handle hash keys.
 * "this" when the function is called will be the IndexDefinition.
 * If a value is returned, it is assigned to the key.
 * If "undefined" is returned, it assumed that the handler
 * processed the value completely.
 */
const keys: KeyProcessorSet = {
    is_primary: (val: any) => !!val,
    index_key: (val: any) => !val ? [] :
        _.isString(val) ?
            _.compact([val]) :
            Array.from(val),
    condition: (val: any) => val || '',
    partition: function(this: IndexDefinition, val: any) {
        // For overrides, ignore undefined
        // But clear the entire value if null

        if (!_.isUndefined(val)) {
            if (!val) {
                this.partition = undefined;
            } else {
                this.partition = {
                    ...this.partition,
                    ...val
                };
            }
        }

        return undefined;
    },
    nodes: function(this: IndexDefinition, val: any) {
        this.nodes = val;

        // for partitioned index, num_replica and nodes
        // are decoupled so skip setting num_replica
        if (val && val.length && !this.partition) {
            this.num_replica = val.length-1;
        }

        return undefined;
    },
    manual_replica: (val: any) => !!val,
    num_replica: function(this: IndexDefinition, val: any) {
        if (!this.partition) {
            return val || (this.nodes ? this.nodes.length-1 : 0);
        } else {
            // for partitioned index, num_replica and nodes
            // are decoupled so skip nodes check
            return val || 0;
        }
    },
    retain_deleted_xattr: (val: any) => !!val,
    lifecycle: function(this: IndexDefinition, val: any) {
        if (!this.lifecycle) {
            this.lifecycle = {};
        }

        if (val) {
            _.extend(this.lifecycle, val);
        }

        return undefined;
    },
    post_process: function(this: IndexDefinition, val: any) {
        let fn: PostProcessHandler;

        if (_.isFunction(val)) {
            fn = val;
        } else if (_.isString(val)) {
            fn = new Function('require', 'process', val) as PostProcessHandler;
        }

        if (fn) {
            fn.call(this, require, process);
        }

        return undefined;
    },
};

/**
 * Represents an index
 */
export class IndexDefinition extends IndexDefinitionBase implements IndexConfigurationBase {
    is_primary: boolean;
    index_key: string[];
    condition?: string;
    partition?: Partition;
    manual_replica: boolean;
    num_replica: number;
    nodes?: string[];
    retain_deleted_xattr: boolean;
    lifecycle?: Lifecycle;
    post_process?: PostProcessHandler;

    /**
     * Creates a new IndexDefinition from a simple object map
     */
    constructor(configuration: IndexConfiguration) {
        super(configuration);

        this.applyOverride(configuration, true);
    }

    /**
     * Creates a new IndexDefinition from a simple object map
     */
    static fromObject(configuration: IndexConfiguration): IndexDefinition {
        return new IndexDefinition(configuration);
    }

    /**
     * Apply overrides to the index definition
     */
    applyOverride(override: IndexConfigurationBase, applyMissing?: boolean): void {
        // Process the keys
        let key: keyof typeof keys;
        for (key in keys) {
            if (applyMissing || override[key] !== undefined) {
                processKey(this, key, keys[key], override[key]);
            }
        }

        // Validate the resulting defintion
        IndexValidators.post_validate.call(this);
    }

    /**
     * Gets the required index mutations, if any, to sync this definition
     */
    * getMutations(context: MutationContext): Iterable<IndexMutation> {
        this.normalizeNodeList(context.currentIndexes);

        const mutations = [];

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

    private * getMutation(context: MutationContext, replicaNum?: number, forceDrop?: boolean): Iterable<IndexMutation> {
        const suffix = !replicaNum ?
            '' :
            `_replica${replicaNum}`;

        const currentIndex = context.currentIndexes.find((index) => {
            return this.isMatch(index, suffix);
        });

        const drop = forceDrop || this.lifecycle.drop;

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

            if (FeatureVersions.alterIndexReplicaCount(context.clusterVersion)) {
                yield new ResizeIndexMutation(this, this.name + suffix);
            } else {
                yield new UpdateIndexMutation(this, this.name + suffix,
                    this.getWithClause(replicaNum),
                    currentIndex);
            }
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

    private getWithClause(replicaNum?: number): WithClause {
        let withClause: WithClause;

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

        if (this.partition && this.partition.num_partition) {
            withClause = {
                ...withClause,
                num_partition: this.partition.num_partition,
            };
        }

        return withClause;
    }

    /**
     * Formats the PartitionHash as a string
     */
    getPartitionString(): string {
        if (!this.partition) {
            return '';
        }

        let str = `${(this.partition.strategy || PartitionStrategy.Hash).toUpperCase()}(`;
        str += this.partition.exprs.join();
        str += ')';

        return str;
    }

    /**
     * Tests to see if a Couchbase index matches this definition
     */
    private isMatch(index: CouchbaseIndex, suffix?: string): boolean {
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
     * Tests to see if a Couchbase index requires updating,
     * ignoring node changes which are handled separately.
     */
    private requiresUpdate(index: CouchbaseIndex): boolean {
        return (index.condition || '') !== this.condition ||
            !_.isEqual(index.index_key, this.index_key) ||
            (index.partition || '') !== this.getPartitionString() ||
            (this.partition && this.partition.num_partition &&
                this.partition.num_partition !== index.num_partition) ||
            !!index.retain_deleted_xattr !== this.retain_deleted_xattr;
    }

    /**
     * Normalizes the index definition using Couchbase standards
     * for condition and index_key.
     */
    async normalize(manager: IndexManager): Promise<void> {
        if (this.is_primary || (this.lifecycle && this.lifecycle.drop)) {
            // Not required for primary index or drops
            return;
        }

        // Calling explain for creating an index returns a plan
        // in which the keys and condition have been normalizaed for us
        // However, we must use a special index name to prevent rejection
        // due to name conflicts.

        const statement =
            this.getCreateStatement(manager.bucketName, '__cbim_normalize');

        let plan: IndexCreatePlan;
        try {
            plan = await manager.getQueryPlan(statement);
        } catch (e) {
            throw new Error(
                `Invalid index definition for ${this.name}: ${e.message}`);
        }

        this.index_key = (plan.keys || []).map((key) =>
            key.expr + (key.desc ? ' DESC' : ''));
        this.condition = plan.where || '';

        if (plan.partition) {
            this.partition = {
                ...plan.partition,
                num_partition: this.partition ? this.partition.num_partition : undefined,
            };
        } else {
            this.partition = undefined;
        }
    }

    /**
     * Formats a CREATE INDEX query which makes this index
     */
    getCreateStatement(bucketName: string): string;
    getCreateStatement(bucketName: string, withClause: WithClause): string;
    getCreateStatement(bucketName: string, indexName: string, withClause?: WithClause): string;
    getCreateStatement(bucketName: string, indexNameOrWithClause?: string | WithClause, withClause?: WithClause): string {
        let indexName: string | undefined;
        if (!_.isString(indexNameOrWithClause)) {
            withClause = indexNameOrWithClause;
        } else {
            indexName = indexNameOrWithClause;
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
     * Apply phases to the collection of index mutations
     */
    private static phaseMutations(mutations: IndexMutation[]): void {
        // All creates should be in phase one
        // All updates should be in one phase each, after creates
        // Everything else should be in the last phase
        // This is relative to each index definition only

        let nextPhase = 1;
        for (const mutation of mutations) {
            if (mutation instanceof CreateIndexMutation) {
                nextPhase = 2;
                mutation.phase = 1;
            }
        }

        for (const mutation of mutations) {
            if (mutation instanceof UpdateIndexMutation) {
                mutation.phase = nextPhase;
                nextPhase += 1;
            }
        }

        for (const mutation of mutations) {
            if (!(mutation instanceof CreateIndexMutation) &&
                !(mutation instanceof UpdateIndexMutation)) {
                mutation.phase = nextPhase;
            }
        }
    }

    /**
     * Ensures that the node list has port numbers and is sorted in the same
     * order as the current indexes.  This allows easy matching of existing
     * node assignments, reducing reindex load due to minor node shifts.
     */
    private normalizeNodeList(currentIndexes: CouchbaseIndex[]): void {
        if (!this.nodes) {
            return;
        }

        this.nodes = this.nodes.map(ensurePort);
        this.nodes.sort();

        if (this.manual_replica) {
            // We only care about specific node mappings for manual replicas
            // For auto replicas we let Couchbase handle it

            const newNodeList = [];
            const unused = _.clone(this.nodes);

            for (let replicaNum=0; replicaNum<=this.num_replica; replicaNum++) {
                const suffix = !replicaNum ?
                    '' :
                    `_replica${replicaNum}`;

                    const index = currentIndexes.find((index) => {
                    return this.isMatch(index, suffix);
                });

                if (index && index.nodes) {
                    const unusedIndex = unused.findIndex(
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
