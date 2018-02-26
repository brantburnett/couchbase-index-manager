/**
 * Abstract base class for index mutations
 * @abstract
 *
 * @private @property {IndexDefinition} definition
 * @private @property {string} name Name of the index to mutate,
 *     may be different than the name in the definition
 */
export class IndexMutation {
    /**
     * @param {IndexDefinition} definition Index definition
     * @param {?string} name Name fo the index to mutate
     */
    constructor(definition, name) {
        this.definition = definition;
        this.name = name || definition.name;
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
