import {IndexMutation} from './index-mutation';
import chalk from 'chalk';

/**
 * @typedef CouchbaseIndex
 * @property {string} name
 * @property {array.string} index_key
 * @property {?string} condition
 */

/**
 * Represents an index mutation which drops an existing index
 */
export class DropIndexMutation extends IndexMutation {
    /**
     * @param {IndexDefinition} definition
     * @param {CouchbaseIndex} existingIndex
     */
    constructor(definition, existingIndex) {
        super(definition);

        this.existingIndex = existingIndex;
    }

    /** @inheritdoc */
    print(logger) {
        logger.info(chalk.redBright(`Delete: ${this.definition.name}`));
    }

    /** @inheritdoc */
    async execute(indexManager, logger) {
        logger.info(chalk.redBright(`Deleting ${this.existingIndex.name}...`));

        await indexManager.dropIndex(this.existingIndex.name);
    }

    /** @inheritdoc */
    isSafe() {
        return false;
    }
}
