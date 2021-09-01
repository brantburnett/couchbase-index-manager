import { ConfigurationType } from '../configuration';
import { IndexDefinition } from '../definition';
import { IndexManager } from '../index-manager';
import { CreateIndexMutation } from './create-index-mutation';
import { Plan, PlanOptions } from './plan';

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
        const firstStub = first.execute = jest.fn().mockImplementation(() => Promise.resolve());

        const second = new CreateIndexMutation(new IndexDefinition({
            type: ConfigurationType.Index,
            name: 'second',
            index_key: 'key',
        }));
        const secondStub = second.execute = jest.fn().mockImplementation(() => Promise.resolve());

        const plan = new Plan(new MockManager(), [first, second], planOptions);

        await plan.execute();

        expect(firstStub)
            .toHaveBeenCalledBefore(secondStub);
        expect(secondStub)
            .toHaveBeenCalledTimes(1);
    });

    it('groups phases', async function() {
        const first = new CreateIndexMutation(new IndexDefinition({
            type: ConfigurationType.Index,
            name: 'first',
            index_key: 'key',
        }));
        const firstStub = first.execute = jest.fn().mockImplementation(() => Promise.resolve());

        const second = new CreateIndexMutation(new IndexDefinition({
            type: ConfigurationType.Index,
            name: 'second',
            index_key: 'key',
        }));
        second.phase = 2;
        const secondStub = second.execute = jest.fn().mockImplementation(() => Promise.resolve());

        const third = new CreateIndexMutation(new IndexDefinition({
            type: ConfigurationType.Index,
            name: 'third',
            index_key: 'key',
        }));
        const thirdStub = third.execute = jest.fn().mockImplementation(() => Promise.resolve());

        const plan = new Plan(new MockManager(), [first, second, third], planOptions);

        await plan.execute();

        expect(firstStub)
            .toHaveBeenCalledBefore(thirdStub);
        expect(thirdStub)
            .toHaveBeenCalledBefore(secondStub);
        expect(secondStub).toBeCalledTimes(1);
    });

    it('phase failure runs rest of phase', async function() {
        const first = new CreateIndexMutation(new IndexDefinition({
            type: ConfigurationType.Index,
            name: 'first',
            index_key: 'key',
        }));
        first.execute = jest.fn().mockImplementation(() => { throw new Error('Error') });

        const second = new CreateIndexMutation(new IndexDefinition({
            type: ConfigurationType.Index,
            name: 'second',
            index_key: 'key',
        }));
        const secondStub = second.execute = jest.fn().mockImplementation(() => Promise.resolve());

        const plan = new Plan(new MockManager(), [first, second], planOptions);

        try {
            await plan.execute()
        } catch (_) {
            // eat errors
        }

        expect(secondStub).toBeCalledTimes(1);
    });

    it('phase failure skips subsequent phases', async function() {
        const first = new CreateIndexMutation(new IndexDefinition({
            type: ConfigurationType.Index,
            name: 'first',
            index_key: 'key',
        }));
        first.execute = jest.fn().mockImplementation(() => { throw new Error('Error') });

        const second = new CreateIndexMutation(new IndexDefinition({
            type: ConfigurationType.Index,
            name: 'second',
            index_key: 'key',
        }));
        second.phase = 2;
        const secondStub = second.execute = jest.fn().mockImplementation(() => Promise.resolve());

        const plan = new Plan(new MockManager(), [first, second], planOptions);

        try {
            await plan.execute();
        } catch (_) {
            // eat errors
        }

        expect(secondStub).not.toBeCalled();
    });
});
