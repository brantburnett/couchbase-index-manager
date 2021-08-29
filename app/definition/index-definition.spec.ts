import { expect, use } from 'chai';
import chaiArrays from 'chai-arrays';
import chaiThings from 'chai-things';
import { stub } from 'sinon';
import sinonChai from 'sinon-chai';
import { Lifecycle, Partition, PartitionStrategy } from '../configuration';
import { CouchbaseIndex, DEFAULT_COLLECTION, DEFAULT_SCOPE, IndexManager } from '../index-manager';
import { CreateIndexMutation } from '../plan/create-index-mutation';
import { MoveIndexMutation } from '../plan/move-index-mutation';
import { ResizeIndexMutation } from '../plan/resize-index-mutation';
import { UpdateIndexMutation } from '../plan/update-index-mutation';
import { IndexDefinition } from './index-definition';

use(chaiArrays);
use(chaiThings);
use(sinonChai);

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

        expect(def.name)
            .to.equal('test');
    });

    it('applies index_key string', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        expect(def.index_key)
            .to.be.equalTo(['key']);
    });

    it('applies index_key array', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: ['key1', 'key2'],
        });

        expect(def.index_key)
            .to.be.equalTo(['key1', 'key2']);
    });

    it('primary key with index_key throws error', function() {
        expect(() => new IndexDefinition({
            name: 'test',
            is_primary: true,
            index_key: ['key'],
        }))
            .to.throw();
    });

    it('primary key with condition throws error', function() {
        expect(() => new IndexDefinition({
            name: 'test',
            is_primary: true,
            condition: '(`type` = "predicate")',
        }))
            .to.throw();
    });

    it('secondary index without index_key throws error', function() {
        expect(() => new IndexDefinition({
            name: 'test',
            index_key: null,
        }))
            .to.throw();
    });

    it('secondary index with empty index_key throws error', function() {
        expect(() => new IndexDefinition({
            name: 'test',
            index_key: [],
        }))
            .to.throw();
    });

    it('manual replica with partition throws error', function() {
        expect(() => new IndexDefinition({
            name: 'test',
            index_key: 'key',
            manual_replica: true,
            partition: {
                exprs: ['type'],
            },
        }))
            .to.throw();
    });

    it('node list sets num_replica', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            nodes: ['a', 'b'],
        });

        expect(def.num_replica)
            .to.equal(1);
    });

    it('no node list keeps num_replica', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            num_replica: 2,
        });

        expect(def.num_replica)
            .to.equal(2);
    });

    it('no num_replica is 0', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        expect(def.num_replica)
            .to.equal(0);
    });

    it('no manual_replica is false', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        expect(def.manual_replica)
            .to.equal(false);
    });

    it('manual_replica sets value', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            manual_replica: true,
        });

        expect(def.manual_replica)
            .to.equal(true);
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

        expect(def.lifecycle)
            .to.not.equal(lifecycle);
        expect(def.lifecycle)
            .to.deep.equal(lifecycle);
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

        expect(def.partition)
            .to.not.equal(partition);
        expect(def.partition)
            .to.deep.equal(partition);
    });

    it('partition null is undefined', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            partition: null,
        });

        expect(def.partition)
            .to.be.undefined;
    });

    it('no retain_deleted_xattr is false', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        expect(def.retain_deleted_xattr)
            .to.equal(false);
    });

    it('retain_deleted_xattr sets value', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            retain_deleted_xattr: true,
        });

        expect(def.retain_deleted_xattr)
            .to.equal(true);
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
            .to.be.equalTo(['key2']);
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
            .to.be.equalTo(['key3', 'key4']);
    });

    it('primary key with index_key throws error', function() {
        const def = new IndexDefinition({
            name: 'test',
            is_primary: true,
        });

        expect(() => def.applyOverride({
            name: 'test',
            index_key: ['key'],
        }))
            .to.throw();
    });

    it('primary key with condition throws error', function() {
        const def = new IndexDefinition({
            name: 'test',
            is_primary: true,
        });

        expect(() => def.applyOverride({
            name: 'test',
            condition: '(`type` = "predicate")',
        }))
            .to.throw();
    });

    it('secondary index without index_key throws error', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        expect(() => def.applyOverride({
            name: 'test',
            index_key: null,
        }))
            .to.throw();
    });

    it('secondary index with empty index_key throws error', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        expect(() => def.applyOverride({
            name: 'test',
            index_key: [],
        }))
            .to.throw();
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
        }))
            .to.throw();
    });

    it('node list sets num_replica', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        def.applyOverride({
            nodes: ['a', 'b'],
        });

        expect(def.num_replica)
            .to.equal(1);
    });

    it('no node list keeps num_replica', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        def.applyOverride({
            num_replica: 2,
        });

        expect(def.num_replica)
            .to.equal(2);
    });

    it('nodes and num_replica mismatch throws', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        expect(() => def.applyOverride({
            nodes: ['a'],
            num_replica: 2,
        }))
            .to.throw();
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

        expect(def.nodes)
            .to.have.length(3);
        expect(def.num_replica)
            .to.equal(2);
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

        expect(def.nodes)
            .to.have.length(3);
        expect(def.num_replica)
            .to.equal(2);
    });

    it('no manual_replica is unchanged', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            manual_replica: true,
        });

        def.applyOverride({});

        expect(def.manual_replica)
            .to.equal(true);
    });

    it('manual_replica sets value', function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        def.applyOverride({
            manual_replica: true,
        });

        expect(def.manual_replica)
            .to.equal(true);
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

        expect(def.lifecycle)
            .to.not.equal(lifecycle);
        expect(def.lifecycle)
            .to.have.property('initial', 1);
        expect(def.lifecycle)
            .to.have.property('drop', true);
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

        expect(def.partition)
            .to.deep.equal(partition);
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

        expect(def.partition)
            .to.be.undefined;
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

        expect(def.partition)
            .to.have.property('strategy', 'other');
        expect(def.partition.exprs)
            .is.equalTo(partition.exprs);
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

        expect(def.partition)
            .to.have.property('strategy', PartitionStrategy.Hash);
        expect(def.partition.exprs)
            .is.equalTo(['test3']);
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
        })];

        expect(mutations)
            .to.have.length(0);
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
        })];

        expect(mutations)
            .to.have.length(0);
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
        })];

        expect(mutations)
            .to.have.length(0);
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
        })];

        expect(mutations)
            .to.have.length(1);
        expect(mutations[0])
            .to.be.instanceof(UpdateIndexMutation);
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
        })];

        expect(mutations)
            .to.have.length(1);
        expect(mutations[0])
            .to.be.instanceof(UpdateIndexMutation);
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
        })];

        expect(mutations)
            .to.have.length(1);
        expect(mutations[0])
            .to.be.instanceof(UpdateIndexMutation);
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
        })];

        expect(mutations)
            .to.have.length(1);
        expect(mutations[0])
            .to.be.instanceof(UpdateIndexMutation);
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
        })];

        expect(mutations)
            .to.have.length(1);
        expect(mutations[0])
            .to.be.instanceof(UpdateIndexMutation)
            .and.to.include({
                name: 'test_replica1',
                phase: 1,
            })
            .and.to.satisfy((m) => m.isSafe());
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
        })];

        expect(mutations)
            .to.have.length(0);
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
        })];

        expect(mutations)
            .to.have.length(3);

        const updates = mutations.filter((m) => m instanceof UpdateIndexMutation);
        expect(updates)
            .to.have.length(1);
        expect(updates[0])
            .and.to.include({
                name: 'test',
                phase: 2,
            })
            .and.to.satisfy((m) => m.isSafe());

        const creates = mutations.filter((m) => m instanceof CreateIndexMutation);
        expect(creates)
            .to.have.length(2);
        for (const create of creates) {
            expect(create)
                .to.include({
                    phase: 1,
                });
        }
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
            clusterVersion: {
                major: 5,
                minor: 5,
            },
        })];

        expect(mutations)
            .to.have.length(1);
        expect(mutations[0])
            .to.be.instanceof(MoveIndexMutation)
            .and.to.include({
                name: 'test',
                phase: 1,
                unsupported: false,
            });
    });

    it('returns unsupported for 5.1 cluster', function() {
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
            clusterVersion: {
                major: 5,
                minor: 1,
            },
        })];

        expect(mutations)
            .to.have.length(1);
        expect(mutations[0])
            .to.be.instanceof(MoveIndexMutation)
            .and.to.include({
                name: 'test',
                phase: 1,
                unsupported: true,
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
            clusterVersion: {
                major: 5,
                minor: 5,
            },
        })];

        expect(mutations)
            .to.have.length(0);
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
            clusterVersion: {
                major: 5,
                minor: 5,
            },
        })];

        expect(mutations)
            .to.have.length(1);
        expect(mutations[0])
            .to.be.instanceof(UpdateIndexMutation)
            .and.to.include({
                name: 'test',
                phase: 1,
            })
            .and.to.satisfy((m) => !m.isSafe());
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
            clusterVersion: {
                major: 5,
                minor: 5,
            },
        })];

        expect(mutations)
            .to.have.length(1);
        expect(mutations[0])
            .to.be.instanceof(UpdateIndexMutation)
            .and.to.include({
                name: 'test',
                phase: 1,
            })
            .and.to.satisfy((m) => !m.isSafe());
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
            clusterVersion: {
                major: 6,
                minor: 5,
            },
        })];

        expect(mutations)
            .to.have.length(1);
        expect(mutations[0])
            .to.be.instanceof(ResizeIndexMutation)
            .and.to.include({
                name: 'test',
                phase: 1,
            })
            .and.to.satisfy((m) => m.isSafe());
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
            clusterVersion: {
                major: 6,
                minor: 5,
            },
        })];

        expect(mutations)
            .to.have.length(1);
        expect(mutations[0])
            .to.be.instanceof(ResizeIndexMutation)
            .and.to.include({
                name: 'test',
                phase: 1,
            })
            .and.to.satisfy((m) => m.isSafe());
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
            clusterVersion: {
                major: 5,
                minor: 5,
            },
        })];

        expect(mutations)
            .to.have.length(1);
        expect(mutations[0])
            .to.be.instanceof(UpdateIndexMutation)
            .and.to.include({
                name: 'test',
                phase: 1,
            })
            .and.to.satisfy((m) => !m.isSafe());
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
            clusterVersion: {
                major: 5,
                minor: 5,
            },
        })];

        expect(mutations)
            .to.have.length(1);
        expect(mutations[0])
            .to.be.instanceof(UpdateIndexMutation)
            .and.to.include({
                name: 'test',
                phase: 1,
            })
            .and.to.satisfy((m) => !m.isSafe());
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
            clusterVersion: {
                major: 6,
                minor: 5,
            },
        })];

        expect(mutations)
            .to.have.length(1);
        expect(mutations[0])
            .to.be.instanceof(ResizeIndexMutation)
            .and.to.include({
                name: 'test',
                phase: 1,
            })
            .and.to.satisfy((m) => m.isSafe());
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
            ].map(fakeIndex)
        })];

        expect(mutations)
            .to.have.length(0);
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
            ].map(fakeIndex)
        })];

        expect(mutations)
            .to.have.length(1);
        expect(mutations[0])
            .to.be.instanceOf(CreateIndexMutation);
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

            def.normalizeNodeList([]);

            expect(def.nodes)
                .to.be.sorted();
        });

        it('adds port numbers', function() {
            const def = new IndexDefinition({
                name: 'test',
                index_key: 'key',
                nodes: ['a', 'b', 'c'],
            });

            def.normalizeNodeList([]);

            expect(def.nodes)
                .to.be.equalTo(['a:8091', 'b:8091', 'c:8091']);
        });

        it('ignores defined port numbers', function() {
            const def = new IndexDefinition({
                name: 'test',
                index_key: 'key',
                nodes: ['a:18091', 'b', 'c'],
            });

            def.normalizeNodeList([]);

            expect(def.nodes)
                .to.be.equalTo(['a:18091', 'b:8091', 'c:8091']);
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

            def.normalizeNodeList([]);

            expect(def.nodes)
                .to.be.sorted();
        });

        it('adds port numbers', function() {
            const def = new IndexDefinition({
                name: 'test',
                index_key: 'key',
                manual_replica: true,
                nodes: ['a', 'b', 'c'],
            });

            def.normalizeNodeList([]);

            expect(def.nodes)
                .to.be.equalTo(['a:8091', 'b:8091', 'c:8091']);
        });

        it('ignores defined port numbers', function() {
            const def = new IndexDefinition({
                name: 'test',
                index_key: 'key',
                manual_replica: true,
                nodes: ['a:18091', 'b', 'c'],
            });

            def.normalizeNodeList([]);

            expect(def.nodes)
                .to.be.equalTo(['a:18091', 'b:8091', 'c:8091']);
        });

        it('sorts to match replicas', function() {
            const def = new IndexDefinition({
                name: 'test',
                index_key: 'key',
                manual_replica: true,
                nodes: ['a', 'b', 'c'],
            });

            def.normalizeNodeList([
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
            ].map(fakeIndex));

            expect(def.nodes)
                .to.be.equalTo(['b:8091', 'c:8091', 'a:8091']);
        });

        it('missing replicas get remaining nodes', function() {
            const def = new IndexDefinition({
                name: 'test',
                index_key: 'key',
                manual_replica: true,
                nodes: ['a', 'b', 'c'],
            });

            def.normalizeNodeList([
                {
                    name: 'test',
                    nodes: ['b:8091'],
                },
            ].map(fakeIndex));

            expect(def.nodes)
                .to.be.equalTo(['b:8091', 'a:8091', 'c:8091']);
        });

        it('missing replica in middle gets remaining node', function() {
            const def = new IndexDefinition({
                name: 'test',
                index_key: 'key',
                manual_replica: true,
                nodes: ['a', 'b', 'c'],
            });

            def.normalizeNodeList([
                {
                    name: 'test',
                    nodes: ['b:8091'],
                },
                {
                    name: 'test_replica2',
                    nodes: ['a:8091'],
                },
            ].map(fakeIndex));

            expect(def.nodes)
                .to.be.equalTo(['b:8091', 'c:8091', 'a:8091']);
        });
    });
});

describe('normalize', function() {
    it('does nothing for primary index', async function() {
        const def = new IndexDefinition({
            name: 'test',
            is_primary: true,
        });

        const getQueryPlan = stub().returns(Promise.resolve({}));

        const manager: Partial<IndexManager> = {
            bucketName: 'test',
            getQueryPlan: getQueryPlan,
        };

        await def.normalize(<IndexManager> manager);

        expect(getQueryPlan)
            .to.not.be.called;
    });

    it('wraps query errors', async function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        const getQueryPlan = stub().returns(Promise.reject(
            new Error('msg test')));

        const manager: Partial<IndexManager> = {
            bucketName: 'test',
            getQueryPlan: getQueryPlan,
        };

        try {
            await def.normalize(<IndexManager> manager);

            throw new Error('No exception encountered');
        } catch (e) {
            expect(e.message)
                .to.equal(
                    `Invalid index definition for ${def.name}: msg test`);
        }
    });

    it('replaces keys', async function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            condition: 'type = \'beer\'',
        });

        const getQueryPlan = stub().returns(Promise.resolve({
            keys: [
                {expr: '`key`'},
            ],
            where: '`type` = "beer"',
        }));

        const manager: Partial<IndexManager> = {
            bucketName: 'test',
            getQueryPlan: getQueryPlan,
        };

        await def.normalize(<IndexManager> manager);

        expect(def.index_key)
            .to.be.equalTo(['`key`']);
    });

    it('handles descending keys', async function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            condition: 'type = \'beer\'',
        });

        const getQueryPlan = stub().returns(Promise.resolve({
            keys: [
                {expr: '`key`', desc: true},
            ],
            where: '`type` = "beer"',
        }));

        const manager: Partial<IndexManager> = {
            bucketName: 'test',
            getQueryPlan: getQueryPlan,
        };

        await def.normalize(<IndexManager> manager);

        expect(def.index_key)
            .to.be.equalTo(['`key` DESC']);
    });

    it('replaces condition', async function() {
        const def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            condition: 'type = \'beer\'',
        });

        const getQueryPlan = stub().returns(Promise.resolve({
            keys: [
                {expr: '`key`'},
            ],
            where: '`type` = "beer"',
        }));

        const manager: Partial<IndexManager> = {
            bucketName: 'test',
            getQueryPlan: getQueryPlan,
        };

        await def.normalize(<IndexManager> manager);

        expect(def.condition)
            .to.equal('`type` = "beer"');
    });

    it('plan without condition leaves condition as empty string',
        async function() {
            const def = new IndexDefinition({
                name: 'test',
                index_key: 'key',
                condition: '',
            });

            const getQueryPlan = stub().returns(Promise.resolve({
                keys: [
                    {expr: '`key`'},
                ],
            }));

            const manager: Partial<IndexManager> = {
                bucketName: 'test',
                getQueryPlan: getQueryPlan,
            };

            await def.normalize(<IndexManager>manager);

            expect(def.condition)
                .to.equal('');
        });

        it('replaces partition', async function() {
            const def = new IndexDefinition({
                name: 'test',
                index_key: 'key',
                partition: {
                    exprs: ['test'],
                },
            });

            const getQueryPlan = stub().returns(Promise.resolve({
                keys: [
                    {expr: '`key`'},
                ],
                partition: {
                    exprs: ['test2'],
                    strategy: 'HASH',
                },
            }));

            const manager: Partial<IndexManager> = {
                bucketName: 'test',
                getQueryPlan: getQueryPlan,
            };

            await def.normalize(<IndexManager> manager);

            expect(def.partition)
                .to.have.property('strategy', 'HASH');
            expect(def.partition)
                .to.have.property('exprs')
                .which.is.equalTo(['test2']);
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

                const getQueryPlan = stub().returns(Promise.resolve({
                    keys: [
                        {expr: '`key`'},
                    ],
                }));

                const manager: Partial<IndexManager> = {
                    bucketName: 'test',
                    getQueryPlan: getQueryPlan,
                };

                await def.normalize(<IndexManager> manager);

                expect(def.partition)
                    .to.be.undefined;
            });
});
