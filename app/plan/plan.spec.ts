import { expect, use } from 'chai';
import chaiArrays from 'chai-arrays';
import chaiThings from 'chai-things';
import { stub } from 'sinon';
import sinonChai from 'sinon-chai';
import { ConfigurationType } from '../configuration';
import { IndexDefinition } from '../definition';
import { IndexManager } from '../index-manager';
import { CreateIndexMutation } from './create-index-mutation';
import { Plan, PlanOptions } from './plan';

use(chaiArrays);
use(chaiThings);
use(sinonChai);

const MockManager = jest.fn<IndexManager, []>(() => ({
    buildDeferredIndexes: jest.fn().mockResolvedValue([]),
    waitForIndexBuild: jest.fn().mockResolvedValue(true),
    getIndexes: jest.fn().mockResolvedValue([])
} as unknown as IndexManager));

const planOptions: PlanOptions = {
    logger: {
        log: () => { /* null logger */ },
        error: () => { /* null logger */ },
        warn: () => { /* null logger */ },
        info: () => { /* null logger */ },
        debug: () => { /* null logger */ }
    },
    buildDelay: 0, // don't delay during unit tests
};

describe('execute', function() {
    it('applies in order', async function() {
        const first = new CreateIndexMutation(new IndexDefinition({
            type: ConfigurationType.Index,
            name: 'first',
            index_key: 'key',
        }));
        const firstStub = stub(first, 'execute').returns(Promise.resolve());

        const second = new CreateIndexMutation(new IndexDefinition({
            type: ConfigurationType.Index,
            name: 'second',
            index_key: 'key',
        }));
        const secondStub = stub(second, 'execute').returns(Promise.resolve());

        const plan = new Plan(new MockManager(), [first, second], planOptions);

        await plan.execute();

        expect(firstStub)
            .to.be.calledBefore(secondStub);
        expect(secondStub)
            .to.be.calledOnce;
    });

    it('groups phases', async function() {
        const first = new CreateIndexMutation(new IndexDefinition({
            type: ConfigurationType.Index,
            name: 'first',
            index_key: 'key',
        }));
        const firstStub = stub(first, 'execute').returns(Promise.resolve());

        const second = new CreateIndexMutation(new IndexDefinition({
            type: ConfigurationType.Index,
            name: 'second',
            index_key: 'key',
        }));
        second.phase = 2;
        const secondStub = stub(second, 'execute').returns(Promise.resolve());

        const third = new CreateIndexMutation(new IndexDefinition({
            type: ConfigurationType.Index,
            name: 'third',
            index_key: 'key',
        }));
        const thirdStub = stub(third, 'execute').returns(Promise.resolve());

        const plan = new Plan(new MockManager(), [first, second, third], planOptions);

        await plan.execute();

        expect(firstStub)
            .to.be.calledBefore(thirdStub);
        expect(thirdStub)
            .to.be.calledBefore(secondStub);
        expect(secondStub)
            .to.be.calledOnce;
    });

    it('phase failure runs rest of phase', async function() {
        const first = new CreateIndexMutation(new IndexDefinition({
            type: ConfigurationType.Index,
            name: 'first',
            index_key: 'key',
        }));
        stub(first, 'execute').throws();

        const second = new CreateIndexMutation(new IndexDefinition({
            type: ConfigurationType.Index,
            name: 'second',
            index_key: 'key',
        }));
        const secondStub = stub(second, 'execute').returns(Promise.resolve());

        const plan = new Plan(new MockManager(), [first, second], planOptions);

        try {
            await plan.execute()
        } catch (_) {
            // eat errors
        }

        expect(secondStub)
            .to.be.calledOnce;
    });

    it('phase failure skips subsequent phases', async function() {
        const first = new CreateIndexMutation(new IndexDefinition({
            type: ConfigurationType.Index,
            name: 'first',
            index_key: 'key',
        }));
        stub(first, 'execute').throws();

        const second = new CreateIndexMutation(new IndexDefinition({
            type: ConfigurationType.Index,
            name: 'second',
            index_key: 'key',
        }));
        second.phase = 2;
        const secondStub = stub(second, 'execute').returns(Promise.resolve());

        const plan = new Plan(new MockManager(), [first, second], planOptions);

        try {
            await plan.execute();
        } catch (_) {
            // eat errors
        }

        expect(secondStub)
            .to.not.be.called;
    });
});
