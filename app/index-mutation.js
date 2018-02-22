/**
 * Abstract base class for index mutations
 * @abstract
 */
export class IndexMutation {
    /**
     * @param  {IndexDefinition} definition Index definition
     */
    constructor(definition) {
        this.definition = definition;
    }

    /**
     * @param  {IndexManager} indexManager Index manager to use for the mutation
     * @param  {*} logger Logger to use for writing output
     * @return {Promise}
     */
    execute(indexManager, logger) {
        return Promise.resolve();
    }

    /**
     * Print the nature of the index mutation
     * @param {*} logger Logger to use for writing output
     */
    print(logger) {
    }

    /**
     * @return {boolean} True if this mutation is safe
     */
    isSafe() {
        return true;
    }
}
