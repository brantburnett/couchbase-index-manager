import {use, expect} from 'chai';
import chaiArrays from 'chai-arrays';
import chaiThings from 'chai-things';
import {IndexDefinition} from '../app/index-definition';
import {UpdateIndexMutation} from '../app/update-index-mutation';
import {CreateIndexMutation} from '../app/create-index-mutation';
import {MoveIndexMutation} from '../app/move-index-mutation';

use(chaiArrays);
use(chaiThings);

describe('ctor', function() {
    it('applies name', function() {
        let def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        expect(def.name)
            .to.equal('test');
    });

    it('applies index_key string', function() {
        let def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        expect(def.index_key)
            .to.be.equalTo(['`key`']);
    });

    it('applies index_key array', function() {
        let def = new IndexDefinition({
            name: 'test',
            index_key: ['key1', 'key2'],
        });

        expect(def.index_key)
            .to.be.equalTo(['`key1`', '`key2`']);
    });

    it('doesn\'t alter already escaped index_keys', function() {
        let def = new IndexDefinition({
            name: 'test',
            index_key: ['`key1`', '`key2`'],
        });

        expect(def.index_key)
            .to.be.equalTo(['`key1`', '`key2`']);
    });

    it('doesn\'t alter function index_keys', function() {
        let def = new IndexDefinition({
            name: 'test',
            index_key: ['STR_TO_MILLIS(`key`)'],
        });

        expect(def.index_key)
            .to.be.equalTo(['STR_TO_MILLIS(`key`)']);
    });

    it('doesn\'t alter array index_keys', function() {
        let def = new IndexDefinition({
            name: 'test',
            index_key: ['DISTINCT ARRAY p FOR p IN `key` END'],
        });

        expect(def.index_key)
            .to.be.equalTo(['DISTINCT ARRAY p FOR p IN `key` END']);
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

    it('condition is normalized to double quotes', function() {
        let def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            condition: '(`type` = \'predicate\')',
        });

        expect(def.condition)
            .to.equal('(`type` = "predicate")');
    });

    it('node list sets num_replica', function() {
        let def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            nodes: ['a', 'b'],
        });

        expect(def.num_replica)
            .to.equal(1);
    });

    it('no node list keeps num_replica', function() {
        let def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            num_replica: 2,
        });

        expect(def.num_replica)
            .to.equal(2);
    });

    it('no num_replica is 0', function() {
        let def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        expect(def.num_replica)
            .to.equal(0);
    });

    it('no manual_replica is false', function() {
        let def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        expect(def.manual_replica)
            .to.equal(false);
    });

    it('manual_replica sets value', function() {
        let def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            manual_replica: true,
        });

        expect(def.manual_replica)
            .to.equal(true);
    });

    it('lifecycle copies values', function() {
        let lifecycle = {
            drop: true,
        };

        let def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            lifecycle: lifecycle,
        });

        expect(def.lifecycle)
            .to.not.equal(lifecycle);
        expect(def.lifecycle)
            .to.deep.equal(lifecycle);
    });
});

describe('applyOverride', function() {
    it('applies index_key string', function() {
        let def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        def.applyOverride({
            index_key: 'key2',
        });

        expect(def.index_key)
            .to.be.equalTo(['`key2`']);
    });

    it('applies index_key array', function() {
        let def = new IndexDefinition({
            name: 'test',
            index_key: ['key1', 'key2'],
        });

        def.applyOverride({
            index_key: ['key3', 'key4'],
        });

        expect(def.index_key)
            .to.be.equalTo(['`key3`', '`key4`']);
    });

    it('primary key with index_key throws error', function() {
        let def = new IndexDefinition({
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
        let def = new IndexDefinition({
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
        let def = new IndexDefinition({
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
        let def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        expect(() => def.applyOverride({
            name: 'test',
            index_key: [],
        }))
            .to.throw();
    });

    it('node list sets num_replica', function() {
        let def = new IndexDefinition({
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
        let def = new IndexDefinition({
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
        let def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
        });

        expect(() => def.applyOverride({
            nodes: ['a'],
            num_replica: 2,
        }))
            .to.throw();
    });

    it('nodes and num_replica match succeeds', function() {
        let def = new IndexDefinition({
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
        let def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            manual_replica: true,
        });

        def.applyOverride({});

        expect(def.manual_replica)
            .to.equal(true);
    });

    it('manual_replica sets value', function() {
        let def = new IndexDefinition({
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
        let def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            lifecycle: {
                initial: 1,
            },
        });

        let lifecycle = {
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
});

describe('getMutation manual replica node changes', function() {
    it('performs node move as an update', function() {
        let def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            manual_replica: true,
            nodes: ['a', 'b'],
        });

        let mutations = [...def.getMutations({
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
            ],
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
        let def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            manual_replica: true,
            nodes: ['a', 'b'],
        });

        let mutations = [...def.getMutations({
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
            ],
        })];

        expect(mutations)
            .to.have.length(0);
    });

    it('creates new replicas first', function() {
        let def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            manual_replica: true,
            nodes: ['a', 'b', 'c'],
        });

        let mutations = [...def.getMutations({
            currentIndexes: [
                {
                    name: 'test',
                    index_key: ['`key`'],
                    nodes: ['d:8091'],
                },
            ],
        })];

        expect(mutations)
            .to.have.length(3);

        let updates = mutations.filter((m) => m instanceof UpdateIndexMutation);
        expect(updates)
            .to.have.length(1);
        expect(updates[0])
            .and.to.include({
                name: 'test',
                phase: 2,
            })
            .and.to.satisfy((m) => m.isSafe());

        let creates = mutations.filter((m) => m instanceof CreateIndexMutation);
        expect(creates)
            .to.have.length(2);
        for (let create of creates) {
            expect(create)
                .to.include({
                    phase: 1,
                });
        }
    });
});

describe('getMutation automatic replica node changes', function() {
    it('performs single move mutation', function() {
        let def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            nodes: ['a', 'b'],
        });

        let mutations = [...def.getMutations({
            currentIndexes: [
                {
                    name: 'test',
                    index_key: ['`key`'],
                    nodes: ['a:8091', 'c:8091'],
                    num_replica: 1,
                },
            ],
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
        let def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            nodes: ['a', 'b'],
        });

        let mutations = [...def.getMutations({
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
                    num_replica: 0,
                },
            ],
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
        let def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            nodes: ['a', 'b'],
        });

        let mutations = [...def.getMutations({
            currentIndexes: [
                {
                    name: 'test',
                    index_key: ['`key`'],
                    nodes: ['b:8091', 'a:8091'],
                    num_replica: 1,
                },
            ],
            clusterVersion: {
                major: 5,
                minor: 5,
            },
        })];

        expect(mutations)
            .to.have.length(0);
    });

    it('num_replica change gives unsafe update', function() {
        let def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            num_replica: 2,
        });

        let mutations = [...def.getMutations({
            currentIndexes: [
                {
                    name: 'test',
                    index_key: ['`key`'],
                    nodes: ['a:8091', 'b:8091'],
                    num_replica: 1,
                },
            ],
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
        let def = new IndexDefinition({
            name: 'test',
            index_key: 'key',
            nodes: ['a'],
        });

        let mutations = [...def.getMutations({
            currentIndexes: [
                {
                    name: 'test',
                    index_key: ['`key`'],
                    nodes: ['a:8091', 'b:8091'],
                    num_replica: 1,
                },
            ],
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
});

describe('normalizeNodeList', function() {
    describe('auto replica', function() {
        it('sorts node lists', function() {
            let def = new IndexDefinition({
                name: 'test',
                index_key: 'key',
                nodes: ['b', 'c', 'a'],
            });

            def.normalizeNodeList([]);

            expect(def.nodes)
                .to.be.sorted();
        });

        it('adds port numbers', function() {
            let def = new IndexDefinition({
                name: 'test',
                index_key: 'key',
                nodes: ['a', 'b', 'c'],
            });

            def.normalizeNodeList([]);

            expect(def.nodes)
                .to.be.equalTo(['a:8091', 'b:8091', 'c:8091']);
        });

        it('ignores defined port numbers', function() {
            let def = new IndexDefinition({
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
            let def = new IndexDefinition({
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
            let def = new IndexDefinition({
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
            let def = new IndexDefinition({
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
            let def = new IndexDefinition({
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
            ]);

            expect(def.nodes)
                .to.be.equalTo(['b:8091', 'c:8091', 'a:8091']);
        });

        it('missing replicas get remaining nodes', function() {
            let def = new IndexDefinition({
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
            ]);

            expect(def.nodes)
                .to.be.equalTo(['b:8091', 'a:8091', 'c:8091']);
        });

        it('missing replica in middle gets remaining node', function() {
            let def = new IndexDefinition({
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
            ]);

            expect(def.nodes)
                .to.be.equalTo(['b:8091', 'c:8091', 'a:8091']);
        });
    });
});
