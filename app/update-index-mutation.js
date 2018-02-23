import {IndexMutation} from './index-mutation';
import {CreateIndexMutation} from './create-index-mutation';
import {DropIndexMutation} from './drop-index-mutation';
import chalk from 'chalk';
import {isEqual} from 'lodash';

/**
 * @typedef CouchbaseIndex
 * @property {string} name
 * @property {array.string} index_key
 * @property {?string} condition
 */

 /**
 * Represents an index mutation which updates an existing index
 */
export class UpdateIndexMutation extends IndexMutation {
     /**
     * @param {IndexDefinition} definition
     * @param {CouchbaseIndex} existingIndex
     */
    constructor(definition, existingIndex) {
        super(definition);

        this.existingIndex = existingIndex;
    }

    /** @inheritDoc */
    print(logger) {
        logger.info(
            chalk.cyanBright(
                `Update: ${this.definition.name}`));

        if (!isEqual(this.existingIndex.index_key, this.definition.index_key)) {
            logger.info(
                chalk.cyanBright(
                    `  Keys: ${this.formatKeys(this.existingIndex)}`));
            logger.info(
                chalk.cyanBright(
                    `     -> ${this.formatKeys(this.definition)}`));
        }

        if (!isEqual(this.existingIndex.condition, this.definition.condition)) {
            logger.info(
                chalk.cyanBright(
                    `  Cond: ${this.existingIndex.condition || 'none'}`));
            logger.info(
                chalk.cyanBright(
                    `     -> ${this.definition.condition || 'none'}`));
        }

        if (this.definition.num_replica > 0) {
            logger.info(
                chalk.cyanBright(
                    `  Repl: ${this.definition.num_replica}`));
        }
    }

    /** @inheritDoc */
    async execute(manager, logger) {
        let dropMutation =
            new DropIndexMutation(this.definition, this.existingIndex);
        await dropMutation.execute(manager, logger);

        let createMutation = new CreateIndexMutation(this.definition);
        await createMutation.execute(manager, logger);
    }

    /**
     * @private
     * Formats a list of keys for human readable output
     *
     * @param {{index_key: array.string}} index
     * @return {string}
     */
    formatKeys(index) {
        return index.index_key.join(',');
    }

    /** @inheritDoc */
    isSafe() {
        return false;
    }
}
