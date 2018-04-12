import {IndexMutation} from './index-mutation';
import chalk from 'chalk';

/**
 * @typedef CouchbaseIndex
 * @property {string} name
 * @property {array.string} index_key
 * @property {?string} condition
 */

 /**
 * Represents an index mutation which updates an existing index
 */
export class MoveIndexMutation extends IndexMutation {
    /**
     * @param {IndexDefinition} definition Index definition
     * @param {string} name Name of the index to mutate
     * @param {boolean} unsupported
     *     If true, don't actually perform this mutation
     */
    constructor(definition, name, unsupported) {
        super(definition, name);

        this.unsupported = unsupported;
    }

    /** @inheritDoc */
    print(logger) {
        const color = this.unsupported ?
            chalk.yellowBright :
            chalk.cyanBright;

        logger.info(color(
            `  Move: ${this.name}`));

        logger.info(color(
            ` Nodes: ${this.definition.nodes.join()}`));

        if (this.unsupported) {
            logger.info(color(
                `  Skip: ALTER INDEX is not supported until CB 5.5`
            ));
        }
    }

    /** @inheritDoc */
    async execute(manager, logger) {
        if (!this.unsupported) {
            await manager.moveIndex(this.name, this.definition.nodes);
        }
    }

    /** @inheritDoc */
    isSafe() {
        return true;
    }
}
