import {IndexMutation} from './index-mutation';
import chalk from 'chalk';

/**
 * @typedef CouchbaseIndex
 * @property {string} name
 * @property {array.string} index_key
 * @property {?string} condition
 */

 /**
 * Represents an index mutation which resizes an existing index to a different number of replicas
 */
export class ResizeIndexMutation extends IndexMutation {
    /**
     * @param {IndexDefinition} definition Index definition
     * @param {string} name Name of the index to mutate
     * @param {boolean} unsupported
     *     If true, don't actually perform this mutation
     */
    constructor(definition, name) {
        super(definition, name);
    }

    /** @inheritDoc */
    print(logger) {
        const color = this.unsupported ?
            chalk.yellowBright :
            chalk.cyanBright;

        logger.info(color(
            `Resize: ${this.name}`));

        logger.info(color(
            `  Repl: ${this.definition.num_replica}`));

        if (this.definition.nodes) {
            logger.info(color(
                ` Nodes: ${this.definition.nodes.join()}`));
        }
    }

    /** @inheritDoc */
    async execute(manager, logger) {
        await manager.resizeIndex(this.name, this.definition.num_replica, this.definition.nodes);
    }

    /** @inheritDoc */
    isSafe() {
        return true;
    }
}
