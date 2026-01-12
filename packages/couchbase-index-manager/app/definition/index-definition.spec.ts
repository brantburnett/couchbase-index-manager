import { Lifecycle, Partition, PartitionStrategy } from '../configuration';
import { CouchbaseIndex, DEFAULT_COLLECTION, DEFAULT_SCOPE, IndexManager } from '../index-manager';
import { CreateIndexMutation } from '../plan/create-index-mutation';
import { MoveIndexMutation } from '../plan/move-index-mutation';
import { ResizeIndexMutation } from '../plan/resize-index-mutation';
import { UpdateIndexMutation } from '../plan/update-index-mutation';
import { IndexDefinition } from './index-definition';

const defaultFakeIndex: CouchbaseIndex = {
    id: 'fake',
    name: 'fake',
    scope: DEFAULT_SCOPE,
    collection: DEFAULT_COLLECTION,
    index_key: ['id'],
    num_replica: 0,
    num_partition: 0,
    nodes: ['127.0.0.1:8091'],
    retain_deleted_xattr: false,
    state: 'online',
    using: 'gsi',
}

function fakeIndex(index: Partial<CouchbaseIndex>): CouchbaseIndex {
    return {
        ...defaultFakeIndex,
        ...index
    }
}

describe('ctor', function() {
    it('applies name', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        expect(def.name).toBe('test');
    });

    it('applies index_key string', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        expect(def.index_key)
            .toStrictEqual(['key']);
    });

    it('applies index_key array', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: ['key1', 'key2'],
        });

        expect(def.index_key)
            .toStrictEqual(['key1', 'key2']);
    });

    it('primary key with index_key throws error', function() {
        expect(() => new IndexDefinition({
            name: 'test',
            is_primary: true,
            index_key: ['key'],
        })).toThrow();
    });

    it('primary key with condition throws error', function() {
        expect(() => new IndexDefinition({
            name: 'test',
            is_primary: true,
            condition: '(`type` = "predicate")',
        })).toThrow();
    });

    it('secondary index without index_key throws error', function() {
        expect(() => new IndexDefinition({
            name: 'test',
            index_key: undefined,
        })).toThrow();
    });

    it('secondary index with empty index_key throws error', function() {
        expect(() => new IndexDefinition({
            name: 'test',
            index_key: [],
        })).toThrow();
    });

    it('manual replica with partition throws error', function() {
        expect(() => new IndexDefinition({
            name: 'test',
            index_key: 'key',
            manual_replica: true,
            partition: {
                exprs: ['type'],
            },
        })).toThrow();
    });

    it('node list sets num_replica', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            nodes: ['a', 'b'],
        });

        expect(def.num_replica).toBe(1);
    });

    it('no node list keeps num_replica', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            num_replica: 2,
        });

        expect(def.num_replica).toBe(2);
    });

    it('no num_replica is undefined', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        expect(def.num_replica).toBeUndefined();
    });

    it('no manual_replica is false', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        expect(def.manual_replica).toBe(false);
    });

    it('manual_replica sets value', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            manual_replica: true,
        });

        expect(def.manual_replica).toBe(true);
    });

    it('lifecycle copies values', function() {
        const lifecycle = {
            drop: true,
        };

        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            lifecycle: lifecycle,
        });

        expect(def.lifecycle).not.toBe(lifecycle);
        expect(def.lifecycle).toEqual(lifecycle);
    });

    it('partition copies values', function() {
        const partition: Partition = {
            exprs: ['test'],
            strategy: PartitionStrategy.Hash,
        };

        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            partition: partition,
        });

        expect(def.partition).not.toBe(partition);
        expect(def.partition).toEqual(partition);
    });

    it('partition null is undefined', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            partition: null,
        });

        expect(def.partition).toBeUndefined();
    });

    it('no retain_deleted_xattr is false', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        expect(def.retain_deleted_xattr).toBe(false);
    });

    it('retain_deleted_xattr sets value', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            retain_deleted_xattr: true,
        });

        expect(def.retain_deleted_xattr).toBe(true);
    });
});

describe('applyOverride', function() {
    it('applies index_key string', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        def.applyOverride({
            index_key: 'key2',
        });

        expect(def.index_key)
            .toStrictEqual(['key2']);
    });

    it('applies index_key array', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: ['key1', 'key2'],
        });

        def.applyOverride({
            index_key: ['key3', 'key4'],
        });

        expect(def.index_key)
            .toStrictEqual(['key3', 'key4']);
    });

    it('primary key with index_key throws error', function() {
        const def = new IndexDefinition({
            name: 'test',
            is_primary: true,
        });

        expect(() => def.applyOverride({
            name: 'test',
            index_key: ['key'],
        })).toThrow();
    });

    it('primary key with condition throws error', function() {
        const def = new IndexDefinition({
            name: 'test',
            is_primary: true,
        });

        expect(() => def.applyOverride({
            name: 'test',
            condition: '(`type` = "predicate")',
        })).toThrow();
    });

    it('secondary index without index_key throws error', function() {
        expect(() => new IndexDefinition({
            name: 'test',
            index_key: undefined,
        })).toThrow();
    });

    it('secondary index with empty index_key throws error', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        expect(() => def.applyOverride({
            name: 'test',
            index_key: [],
        })).toThrow();
    });

    it('manual replica with partition throws error', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            manual_replica: true,
        });

        expect(() => def.applyOverride({
            partition: {
                exprs: ['type'],
            },
        })).toThrow();
    });

    it('node list sets num_replica', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        def.applyOverride({
            nodes: ['a', 'b'],
        });

        expect(def.num_replica).toBe(1);
    });

    it('no node list keeps num_replica', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        def.applyOverride({
            num_replica: 2,
        });

        expect(def.num_replica).toBe(2);
    });

    it('no node list keeps num_replica undefined', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        def.applyOverride({});

        expect(def.num_replica).toBeUndefined();
    });

    it('nodes and num_replica mismatch throws', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        expect(() => def.applyOverride({
            nodes: ['a'],
            num_replica: 2,
        })).toThrow();
    });

    it('partitioned nodes and num_replica mismatch succeeds', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            partition: {
                exprs: ['type'],
            },
        });

        def.applyOverride({
            nodes: ['a', 'b', 'c'],
            num_replica: 2,
        });

        expect(def.nodes).toHaveLength(3);
        expect(def.num_replica).toBe(2);
    });

    it('nodes and num_replica match succeeds', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        def.applyOverride({
            nodes: ['a', 'b', 'c'],
            num_replica: 2,
        });

        expect(def.nodes).toHaveLength(3);
        expect(def.num_replica).toBe(2);
    });

    it('no manual_replica is unchanged', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            manual_replica: true,
        });

        def.applyOverride({});

        expect(def.manual_replica).toBe(true);
    });

    it('manual_replica sets value', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        def.applyOverride({
            manual_replica: true,
        });

        expect(def.manual_replica).toBe(true);
    });

    it('lifecycle copies values', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            lifecycle: {
                initial: 1,
            } as Lifecycle,
        });

        const lifecycle = {
            drop: true,
        };

        def.applyOverride({
            lifecycle: lifecycle,
        });

        expect(def.lifecycle).not.toBe(lifecycle);
        expect(def.lifecycle).toHaveProperty('initial', 1);
        expect(def.lifecycle).toHaveProperty('drop', true);
    });

    it('partition undefined leaves unmodified', function() {
        const partition: Partition = {
            exprs: ['test'],
            strategy: PartitionStrategy.Hash,
        };

        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            partition: partition,
        });

        def.applyOverride({});

        expect(def.partition).toEqual(partition);
    });

    it('partition null clears', function() {
        const partition: Partition = {
            exprs: ['test'],
            strategy: PartitionStrategy.Hash,
        };

        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            partition: partition,
        });

        def.applyOverride({
            partition: null,
        });

        expect(def.partition).toBeUndefined();
    });

    it('partition updates strategy', function() {
        const partition: Partition = {
            exprs: ['test'],
            strategy: PartitionStrategy.Hash,
        };

        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            partition: partition,
        });

        def.applyOverride({
            partition: {
                strategy: 'other',
            } as unknown as Partition,
        });

        expect(def.partition).toHaveProperty('strategy', 'other');
        expect(def.partition?.exprs)
            .toStrictEqual(partition.exprs);
    });

    it('partition replaces exprs', function() {
        const partition: Partition = {
            exprs: ['test', 'test2'],
            strategy: PartitionStrategy.Hash,
        };

        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            partition: partition,
        });

        def.applyOverride({
            partition: {
                exprs: ['test3'],
            },
        });

        expect(def.partition).toHaveProperty('strategy', PartitionStrategy.Hash);
        expect(def.partition?.exprs)
            .toStrictEqual(['test3']);
    });
});

describe('getMutation partition change', function() {
    it('ignores matching partition', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: '`key`',
            partition: {
                exprs: ['`test`'],
            },
        });

        const mutations = [...def.getMutations({
            currentIndexes: [
                fakeIndex({
                    name: 'test',
                    index_key: ['`key`'],
                    partition: 'HASH(`test`)',
                    nodes: ['a:8091'],
                }),
            ],
            isSecure: false,
        })];

        expect(mutations).toHaveLength(0);
    });

    it('ignores matching num_partition', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: '`key`',
            partition: {
                exprs: ['`test`'],
                num_partition: 3,
            },
        });

        const mutations = [...def.getMutations({
            currentIndexes: [
                {
                    name: 'test',
                    index_key: ['`key`'],
                    partition: 'HASH(`test`)',
                    num_partition: 3,
                    nodes: ['a:8091'],
                },
            ].map(fakeIndex),
            isSecure: false,
        })];

        expect(mutations).toHaveLength(0);
    });

    it('ignores missing num_partition', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: '`key`',
            partition: {
                exprs: ['`test`'],
            },
        });

        const mutations = [...def.getMutations({
            currentIndexes: [
                {
                    name: 'test',
                    index_key: ['`key`'],
                    partition: 'HASH(`test`)',
                    num_partition: 8,
                    nodes: ['a:8091'],
                },
            ].map(fakeIndex),
            isSecure: false,
        })];

        expect(mutations).toHaveLength(0);
    });

    it('updates if partition does not match', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: '`key`',
            partition: {
                exprs: ['`test`'],
            },
        });

        const mutations = [...def.getMutations({
            currentIndexes: [
                {
                    name: 'test',
                    index_key: ['`key`'],
                    partition: 'HASH(`test2`)',
                    nodes: ['a:8091'],
                },
            ].map(fakeIndex),
            isSecure: false,
        })];

        expect(mutations).toHaveLength(1);
        expect(mutations[0]).toBeInstanceOf(UpdateIndexMutation);
    });

    it('updates if num_partition does not match', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: '`key`',
            partition: {
                exprs: ['`test`'],
                num_partition: 3,
            },
        });

        const mutations = [...def.getMutations({
            currentIndexes: [
                {
                    name: 'test',
                    index_key: ['`key`'],
                    partition: 'HASH(`test2`)',
                    num_partition: 8,
                    nodes: ['a:8091'],
                },
            ].map(fakeIndex),
            isSecure: false,
        })];

        expect(mutations).toHaveLength(1);
        expect(mutations[0]).toBeInstanceOf(UpdateIndexMutation);
    });

    it('updates if partition removed', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: '`key`',
        });

        const mutations = [...def.getMutations({
            currentIndexes: [
                {
                    name: 'test',
                    index_key: ['`key`'],
                    partition: 'HASH(`test2`)',
                    nodes: ['a:8091'],
                },
            ].map(fakeIndex),
            isSecure: false,
        })];

        expect(mutations).toHaveLength(1);
        expect(mutations[0]).toBeInstanceOf(UpdateIndexMutation);
    });

    it('updates if partition added', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: '`key`',
            partition: {
                exprs: ['`test`'],
            },
        });

        const mutations = [...def.getMutations({
            currentIndexes: [
                {
                    name: 'test',
                    index_key: ['`key`'],
                    nodes: ['a:8091'],
                },
            ].map(fakeIndex),
            isSecure: false,
        })];

        expect(mutations).toHaveLength(1);
        expect(mutations[0]).toBeInstanceOf(UpdateIndexMutation);
    });
});

describe('getMutation manual replica node changes', function() {
    it('performs node move as an update', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: '`key`',
            manual_replica: true,
            nodes: ['a', 'b'],
        });

        const mutations = [...def.getMutations({
            currentIndexes: [
                {
                    name: 'test',
                    index_key: ['`key`'],
                    nodes: ['a:8091'],
                },
                {
                    name: 'test_replica1',
                    index_key: ['`key`'],
                    nodes: ['c:8091'],
                },
            ].map(fakeIndex),
            isSecure: false,
        })];

        expect(mutations).toHaveLength(1);
        expect(mutations[0]).toBeInstanceOf(UpdateIndexMutation)
        expect(mutations[0].isSafe()).toBe(true);
        expect(mutations[0]).toMatchObject({
            name: 'test_replica1',
            phase: 1,
        });
    });

    it('ignores node swap', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: '`key`',
            manual_replica: true,
            nodes: ['a', 'b'],
        });

        const mutations = [...def.getMutations({
            currentIndexes: [
                {
                    name: 'test',
                    index_key: ['`key`'],
                    nodes: ['b:8091'],
                },
                {
                    name: 'test_replica1',
                    index_key: ['`key`'],
                    nodes: ['a:8091'],
                },
            ].map(fakeIndex),
            isSecure: false,
        })];

        expect(mutations).toHaveLength(0);
    });

    it('creates new replicas first', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: '`key`',
            manual_replica: true,
            nodes: ['a', 'b', 'c'],
        });

        const mutations = [...def.getMutations({
            currentIndexes: [
                {
                    name: 'test',
                    index_key: ['`key`'],
                    nodes: ['d:8091'],
                },
            ].map(fakeIndex),
            isSecure: false,
        })];

        expect(mutations).toHaveLength(3);

        const updates = mutations.filter((m) => m instanceof UpdateIndexMutation);
        expect(updates).toHaveLength(1);
        expect(mutations[0].isSafe()).toBe(true);
        expect(mutations[0]).toMatchObject({
            name: 'test',
            phase: 2,
        });

        const creates = mutations.filter((m) => m instanceof CreateIndexMutation);
        expect(creates).toHaveLength(2);
        for (const create of creates) {
            expect(create).toMatchObject({
                    phase: 1,
                });
        }
    });
});

describe('getMutation automatic num_replica', function() {
    it('undefined should not send', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: '`key`'
        });

        const mutations = [...def.getMutations({
            currentIndexes: [],
            isSecure: false,
        })];

        expect(mutations).toHaveLength(1);
        expect(mutations[0]).toBeInstanceOf(CreateIndexMutation)

        const mutation = mutations[0] as CreateIndexMutation;
        expect(mutation.withClause.num_replica).toBeUndefined();
    });

    it('defined should send', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: '`key`',
            num_replica: 0,
        });

        const mutations = [...def.getMutations({
            currentIndexes: [],
            isSecure: false,
        })];

        expect(mutations).toHaveLength(1);
        expect(mutations[0]).toBeInstanceOf(CreateIndexMutation)

        const mutation = mutations[0] as CreateIndexMutation;
        expect(mutation.withClause.num_replica).toBe(0);
    });

    it('undefined should not cause an index update', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: '`key`'
        });

        const mutations = [...def.getMutations({
            currentIndexes: [
                {
                    name: 'test',
                    index_key: ['`key`'],
                    nodes: ['a:8091', 'b:8091', 'c:8091'],
                    num_replica: 2,
                },
            ].map(fakeIndex),
            isSecure: false,
            clusterVersion: {
                major: 5,
                minor: 5,
            },
        })];

        expect(mutations).toHaveLength(0);
    });

});

describe('getMutation automatic replica node changes', function() {
    it('performs single move mutation', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: '`key`',
            nodes: ['a', 'b'],
        });

        const mutations = [...def.getMutations({
            currentIndexes: [
                {
                    name: 'test',
                    index_key: ['`key`'],
                    nodes: ['a:8091', 'c:8091'],
                    num_replica: 1,
                },
            ].map(fakeIndex),
            isSecure: false,
            clusterVersion: {
                major: 5,
                minor: 5,
            },
        })];

        expect(mutations).toHaveLength(1);
        expect(mutations[0]).toBeInstanceOf(MoveIndexMutation);
        expect(mutations[0]).toMatchObject({
            name: 'test',
            phase: 1
        });
    });

    it('ignores node swap', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: '`key`',
            nodes: ['a', 'b'],
        });

        const mutations = [...def.getMutations({
            currentIndexes: [
                {
                    name: 'test',
                    index_key: ['`key`'],
                    nodes: ['b:8091', 'a:8091'],
                    num_replica: 1,
                },
            ].map(fakeIndex),
            isSecure: false,
            clusterVersion: {
                major: 5,
                minor: 5,
            },
        })];

        expect(mutations).toHaveLength(0);
    });

    it('num_replica change gives unsafe update', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: '`key`',
            num_replica: 2,
        });

        const mutations = [...def.getMutations({
            currentIndexes: [
                {
                    name: 'test',
                    index_key: ['`key`'],
                    nodes: ['a:8091', 'b:8091'],
                    num_replica: 1,
                },
            ].map(fakeIndex),
            isSecure: false,
            clusterVersion: {
                major: 5,
                minor: 5,
            },
        })];

        expect(mutations).toHaveLength(1);
        expect(mutations[0]).toBeInstanceOf(UpdateIndexMutation);
        expect(mutations[0].isSafe()).toBe(false);
        expect(mutations[0]).toMatchObject({
            name: 'test',
            phase: 1,
        });
    });

    it('num_replica addition from zero gives unsafe update', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: '`key`',
            num_replica: 1,
        });

        const mutations = [...def.getMutations({
            currentIndexes: [
                {
                    name: 'test',
                    index_key: ['`key`'],
                    nodes: ['a:8091', 'b:8091'],
                    num_replica: 0,
                },
            ].map(fakeIndex),
            isSecure: false,
            clusterVersion: {
                major: 5,
                minor: 5,
            },
        })];

        expect(mutations).toHaveLength(1);
        expect(mutations[0]).toBeInstanceOf(UpdateIndexMutation);
        expect(mutations[0].isSafe()).toBe(false);
        expect(mutations[0]).toMatchObject({
            name: 'test',
            phase: 1,
        });
    });

    it('num_replica change gives resize on 6.5', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: '`key`',
            num_replica: 2,
        });

        const mutations = [...def.getMutations({
            currentIndexes: [
                {
                    name: 'test',
                    index_key: ['`key`'],
                    nodes: ['a:8091', 'b:8091'],
                    num_replica: 1,
                },
            ].map(fakeIndex),
            isSecure: false,
            clusterVersion: {
                major: 6,
                minor: 5,
            },
        })];

        expect(mutations).toHaveLength(1);
        expect(mutations[0]).toBeInstanceOf(ResizeIndexMutation)
        expect(mutations[0].isSafe()).toBe(true);
        expect(mutations[0]).toMatchObject({
            name: 'test',
            phase: 1,
        });
    });

    it('num_replica addition from zero gives resize on 6.5', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: '`key`',
            num_replica: 1,
        });

        const mutations = [...def.getMutations({
            currentIndexes: [
                {
                    name: 'test',
                    index_key: ['`key`'],
                    nodes: ['a:8091'],
                    num_replica: 0,
                },
            ].map(fakeIndex),
            isSecure: false,
            clusterVersion: {
                major: 6,
                minor: 5,
            },
        })];

        expect(mutations).toHaveLength(1);
        expect(mutations[0]).toBeInstanceOf(ResizeIndexMutation)
        expect(mutations[0].isSafe()).toBe(true);
        expect(mutations[0]).toMatchObject({
            name: 'test',
            phase: 1,
        });
    });

    it('partitioned num_replica change gives unsafe update', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: '`key`',
            num_replica: 2,
            partition: {
                exprs: ['`type`'],
            },
        });

        const mutations = [...def.getMutations({
            currentIndexes: [
                {
                    name: 'test',
                    index_key: ['`key`'],
                    nodes: ['a:8091', 'b:8091'],
                    num_replica: 1,
                    partition: 'HASH(`type`)',
                },
            ].map(fakeIndex),
            isSecure: false,
            clusterVersion: {
                major: 5,
                minor: 5,
            },
        })];

        expect(mutations).toHaveLength(1);
        expect(mutations[0]).toBeInstanceOf(UpdateIndexMutation)
        expect(mutations[0].isSafe()).toBe(false);
        expect(mutations[0]).toMatchObject({
            name: 'test',
            phase: 1,
        });
    });

    it('node length change gives unsafe update', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: '`key`',
            nodes: ['a'],
        });

        const mutations = [...def.getMutations({
            currentIndexes: [
                {
                    name: 'test',
                    index_key: ['`key`'],
                    nodes: ['a:8091', 'b:8091'],
                    num_replica: 1,
                },
            ].map(fakeIndex),
            isSecure: false,
            clusterVersion: {
                major: 5,
                minor: 5,
            },
        })];

        expect(mutations).toHaveLength(1);
        expect(mutations[0]).toBeInstanceOf(UpdateIndexMutation)
        expect(mutations[0].isSafe()).toBe(false);
        expect(mutations[0]).toMatchObject({
            name: 'test',
            phase: 1,
        });
    });

    it('node length change gives resize on 6.5', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: '`key`',
            nodes: ['a'],
        });

        const mutations = [...def.getMutations({
            currentIndexes: [
                {
                    name: 'test',
                    index_key: ['`key`'],
                    nodes: ['a:8091', 'b:8091'],
                    num_replica: 1,
                },
            ].map(fakeIndex),
            isSecure: false,
            clusterVersion: {
                major: 6,
                minor: 5,
            },
        })];

        expect(mutations).toHaveLength(1);
        expect(mutations[0]).toBeInstanceOf(ResizeIndexMutation)
        expect(mutations[0].isSafe()).toBe(true);
        expect(mutations[0]).toMatchObject({
            name: 'test',
            phase: 1,
        });
    });
});

describe('getMutation scope/collection', function() {
    it('matches default scope/collection', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: '`key`',
            nodes: ['a:8091'],
        });

        const mutations = [...def.getMutations({
            currentIndexes: [
                {
                    name: 'test',
                    index_key: ['`key`'],
                    nodes: ['a:8091']
                },
            ].map(fakeIndex),
            isSecure: false,
        })];

        expect(mutations).toHaveLength(0);
    });

    it('does not match specific scope/collection with the same name', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: '`key`',
            nodes: ['a:8091'],
        });

        const mutations = [...def.getMutations({
            currentIndexes: [
                {
                    name: 'test',
                    scope: 'inventory',
                    collection: 'hotel',
                    index_key: ['`key`'],
                    nodes: ['a:8091']
                },
            ].map(fakeIndex),
            isSecure: false,
        })];

        expect(mutations).toHaveLength(1);
        expect(mutations[0]).toBeInstanceOf(CreateIndexMutation);
    });
});

describe('normalizeNodeList', function() {
    describe('auto replica', function() {
        it('sorts node lists', function() {
            const def = new IndexDefinition({
                name: 'test',
                index_key: 'key',
                nodes: ['b', 'c', 'a'],
            });

            def.normalizeNodeList({
                currentIndexes: [],
                isSecure: false,
            });

            expect(def.nodes)
                .toStrictEqual(['a:8091', 'b:8091', 'c:8091']);
        });

        it('adds port numbers', function() {
            const def = new IndexDefinition({
                name: 'test',
                index_key: 'key',
                nodes: ['a', 'b', 'c'],
            });

            def.normalizeNodeList({
                currentIndexes: [],
                isSecure: false,
            });

            expect(def.nodes)
                .toStrictEqual(['a:8091', 'b:8091', 'c:8091']);
        });

        it('adds secure port numbers', function() {
            const def = new IndexDefinition({
                name: 'test',
                index_key: 'key',
                nodes: ['a', 'b', 'c'],
            });

            def.normalizeNodeList({
                currentIndexes: [],
                isSecure: true,
            });

            expect(def.nodes)
                .toStrictEqual(['a:18091', 'b:18091', 'c:18091']);
        });

        it('ignores defined port numbers', function() {
            const def = new IndexDefinition({
                name: 'test',
                index_key: 'key',
                nodes: ['a:18091', 'b', 'c'],
            });

            def.normalizeNodeList({
                currentIndexes: [],
                isSecure: false,
            });

            expect(def.nodes)
                .toStrictEqual(['a:18091', 'b:8091', 'c:8091']);
        });
    });

    describe('manual replica', function() {
        it('sorts node lists', function() {
            const def = new IndexDefinition({
                name: 'test',
                index_key: 'key',
                manual_replica: true,
                nodes: ['b', 'c', 'a'],
            });

            def.normalizeNodeList({
                currentIndexes: [],
                isSecure: false,
            });

            expect(def.nodes)
                .toStrictEqual(['a:8091', 'b:8091', 'c:8091']);
        });

        it('adds port numbers', function() {
            const def = new IndexDefinition({
                name: 'test',
                index_key: 'key',
                manual_replica: true,
                nodes: ['a', 'b', 'c'],
            });

            def.normalizeNodeList({
                currentIndexes: [],
                isSecure: false,
            });

            expect(def.nodes)
                .toStrictEqual(['a:8091', 'b:8091', 'c:8091']);
        });

        it('ignores defined port numbers', function() {
            const def = new IndexDefinition({
                name: 'test',
                index_key: 'key',
                manual_replica: true,
                nodes: ['a:18091', 'b', 'c'],
            });

            def.normalizeNodeList({
                currentIndexes: [],
                isSecure: false,
            });

            expect(def.nodes)
                .toStrictEqual(['a:18091', 'b:8091', 'c:8091']);
        });

        it('sorts to match replicas', function() {
            const def = new IndexDefinition({
                name: 'test',
                index_key: 'key',
                manual_replica: true,
                nodes: ['a', 'b', 'c'],
            });

            def.normalizeNodeList({
                currentIndexes: [
                    {
                        name: 'test',
                        nodes: ['b:8091'],
                    },
                    {
                        name: 'test_replica1',
                        nodes: ['c:8091'],
                    },
                    {
                        name: 'test_replica2',
                        nodes: ['a:8091'],
                    },
                ].map(fakeIndex),
                isSecure: false,
            });

            expect(def.nodes)
                .toStrictEqual(['b:8091', 'c:8091', 'a:8091']);
        });

        it('missing replicas get remaining nodes', function() {
            const def = new IndexDefinition({
                name: 'test',
                index_key: 'key',
                manual_replica: true,
                nodes: ['a', 'b', 'c'],
            });

            def.normalizeNodeList({
                currentIndexes: [
                    {
                        name: 'test',
                        nodes: ['b:8091'],
                    },
                ].map(fakeIndex),
                isSecure: false,
            });

            expect(def.nodes)
                .toStrictEqual(['b:8091', 'a:8091', 'c:8091']);
        });

        it('missing replica in middle gets remaining node', function() {
            const def = new IndexDefinition({
                name: 'test',
                index_key: 'key',
                manual_replica: true,
                nodes: ['a', 'b', 'c'],
            });

            def.normalizeNodeList({ 
                    currentIndexes: [
                    {
                        name: 'test',
                        nodes: ['b:8091'],
                    },
                    {
                        name: 'test_replica2',
                        nodes: ['a:8091'],
                    },
                ].map(fakeIndex),
                isSecure: false,
            });

            expect(def.nodes)
                .toStrictEqual(['b:8091', 'c:8091', 'a:8091']);
        });
    });
});

describe('normalize', function() {
    it('does nothing for primary index', async function() {
        const def = new IndexDefinition({
            name: 'test',
            is_primary: true,
        });

        const getQueryPlan = jest.fn().mockResolvedValue({});

        const manager: Partial<IndexManager> = {
            bucketName: 'test',
            getQueryPlan: getQueryPlan,
        };

        await def.normalize(<IndexManager> manager);

        expect(getQueryPlan).not.toHaveBeenCalled();
    });

    it('replaces keys', async function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            condition: 'type = \'beer\'',
        });

        const indexManager = jest.fn<Partial<IndexManager>, []>(() => ({
            bucketName: 'test',
            getQueryPlan: jest.fn().mockResolvedValue({
                keys: [
                    {expr: '`key`'},
                ],
                where: '`type` = "beer"',
            })
        }));

        await def.normalize(<IndexManager> indexManager());

        expect(def.index_key)
            .toStrictEqual(['`key`']);
    });

    it('handles descending keys', async function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            condition: 'type = \'beer\'',
        });

        const indexManager = jest.fn<Partial<IndexManager>, []>(() => ({
            bucketName: 'test',
            getQueryPlan: jest.fn().mockResolvedValue({
                keys: [
                    {expr: '`key`', desc: true},
                ],
                where: '`type` = "beer"',
            })
        }));

        await def.normalize(<IndexManager> indexManager());

        expect(def.index_key)
            .toStrictEqual(['`key` DESC']);
    });

    it('replaces condition', async function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            condition: 'type = \'beer\'',
        });

        const indexManager = jest.fn<Partial<IndexManager>, []>(() => ({
            bucketName: 'test',
            getQueryPlan: jest.fn().mockResolvedValue({
                keys: [
                    {expr: '`key`'},
                ],
                where: '`type` = "beer"'
            })
        }));

        await def.normalize(<IndexManager> indexManager());

        expect(def.condition).toBe('`type` = "beer"');
    });

    it('plan without condition leaves condition as empty string',
        async function() {
            const def = new IndexDefinition({
                name: 'test',
                index_key: 'key',
                condition: '',
            });

            const indexManager = jest.fn<Partial<IndexManager>, []>(() => ({
                bucketName: 'test',
                getQueryPlan: jest.fn().mockResolvedValue({
                    keys: [
                        {expr: '`key`'},
                    ],
                })
            }));
    
            await def.normalize(<IndexManager> indexManager());

            expect(def.condition).toBe('');
        });

        it('replaces partition', async function() {
            const def = new IndexDefinition({
                name: 'test',
                index_key: 'key',
                partition: {
                    exprs: ['test'],
                },
            });

            const indexManager = jest.fn<Partial<IndexManager>, []>(() => ({
                bucketName: 'test',
                getQueryPlan: jest.fn().mockResolvedValue({
                    keys: [
                        {expr: '`key`'},
                    ],
                    partition: {
                        exprs: ['test2'],
                        strategy: 'HASH',
                    },
                })
            }));
    
            await def.normalize(<IndexManager> indexManager());

            expect(def.partition).toHaveProperty('strategy', 'HASH');
            expect(def.partition?.exprs)
                .toStrictEqual(['test2']);
        });

        it('plan without partition leaves partition undefined',
            async function() {
                const def = new IndexDefinition({
                    name: 'test',
                    index_key: 'key',
                    partition: {
                        exprs: ['test'],
                    },
                });

                const indexManager = jest.fn<Partial<IndexManager>, []>(() => ({
                    bucketName: 'test',
                    getQueryPlan: jest.fn().mockResolvedValue({
                        keys: [
                            {expr: '`key`'},
                        ],
                    })
                }));
        
                await def.normalize(<IndexManager> indexManager());

                expect(def.partition).toBeUndefined();
            });
});
