import {use, expect} from 'chai';
import chaiArrays from 'chai-arrays';
import {IndexDefinition} from '../app/index-definition';

use(chaiArrays);

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
