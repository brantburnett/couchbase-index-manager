import {use, expect} from 'chai';
import chaiArrays from 'chai-arrays';
import chaiThings from 'chai-things';
import sinonChai from 'sinon-chai';
import {stub} from 'sinon';
import {IndexDefinition} from '../app/index-definition';
import {CreateIndexMutation} from '../app/create-index-mutation';
import {Plan} from '../app/plan';

use(chaiArrays);
use(chaiThings);
use(sinonChai);

require('jasmine-co').install();

const mockManager = {
    buildDeferredIndexes: () => Promise.resolve(),
    waitForIndexBuild: () => Promise.resolve(),
};

const planOptions = {
    logger: {
        log: () => {},
        error: () => {},
        warn: () => {},
        info: () => {},
    },
    buildDelay: 0, // don't delay during unit tests
};

describe('execute', function() {
    it('applies in order', async function() {
        let first = new CreateIndexMutation(new IndexDefinition({
            name: 'first',
            index_key: 'key',
        }));
        let firstStub = stub(first, 'execute').returns(Promise.resolve());

        let second = new CreateIndexMutation(new IndexDefinition({
            name: 'second',
            index_key: 'key',
        }));
        let secondStub = stub(second, 'execute').returns(Promise.resolve());

        let plan = new Plan(mockManager, [first, second], planOptions);

        await plan.execute();

        expect(firstStub)
            .to.be.calledBefore(secondStub);
        expect(secondStub)
            .to.be.calledOnce;
    });

    it('groups phases', async function() {
        let first = new CreateIndexMutation(new IndexDefinition({
            name: 'first',
            index_key: 'key',
        }));
        let firstStub = stub(first, 'execute').returns(Promise.resolve());

        let second = new CreateIndexMutation(new IndexDefinition({
            name: 'second',
            index_key: 'key',
        }));
        second.phase = 2;
        let secondStub = stub(second, 'execute').returns(Promise.resolve());

        let third = new CreateIndexMutation(new IndexDefinition({
            name: 'third',
            index_key: 'key',
        }));
        let thirdStub = stub(third, 'execute').returns(Promise.resolve());

        let plan = new Plan(mockManager, [first, second, third], planOptions);

        await plan.execute();

        expect(firstStub)
            .to.be.calledBefore(thirdStub);
        expect(thirdStub)
            .to.be.calledBefore(secondStub);
        expect(secondStub)
            .to.be.calledOnce;
    });

    it('phase failure runs rest of phase', async function() {
        let first = new CreateIndexMutation(new IndexDefinition({
            name: 'first',
            index_key: 'key',
        }));
        stub(first, 'execute').throws();

        let second = new CreateIndexMutation(new IndexDefinition({
            name: 'second',
            index_key: 'key',
        }));
        let secondStub = stub(second, 'execute').returns(Promise.resolve());

        let plan = new Plan(mockManager, [first, second], planOptions);

        await plan.execute()
            .catch(() => {});

        expect(secondStub)
            .to.be.calledOnce;
    });

    it('phase failure skips subsequent phases', async function() {
        let first = new CreateIndexMutation(new IndexDefinition({
            name: 'first',
            index_key: 'key',
        }));
        stub(first, 'execute').throws();

        let second = new CreateIndexMutation(new IndexDefinition({
            name: 'second',
            index_key: 'key',
        }));
        second.phase = 2;
        let secondStub = stub(second, 'execute').returns(Promise.resolve());

        let plan = new Plan(mockManager, [first, second], planOptions);

        await plan.execute()
            .catch(() => {});

        expect(secondStub)
            .to.not.be.called;
    });
});
