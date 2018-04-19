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
     * @param {IndexDefinition} definition Index definition
     * @param {?string} name Name fo the index to mutate
     * @param {?Object<string, *>} withClause
     *     Additional clauses for index creation
     * @param {CouchbaseIndex} existingIndex
     */
    constructor(definition, name, withClause, existingIndex) {
        super(definition, name);

        this.withClause = withClause || {};
        this.existingIndex = existingIndex;
    }

    /** @inheritDoc */
    print(logger) {
        logger.info(
            chalk.cyanBright(
                `Update: ${this.name}`));

        if (!isEqual(this.existingIndex.index_key, this.definition.index_key)) {
            logger.info(
                chalk.cyanBright(
                    `  Keys: ${this.formatKeys(this.existingIndex)}`));
            logger.info(
                chalk.cyanBright(
                    `     -> ${this.formatKeys(this.definition)}`));
        }

        if (!isEqual(this.existingIndex.partition || '',
            this.definition.getPartitionString())) {
            logger.info(chalk.cyanBright(
                `  Part: ${this.existingIndex.partition || 'none'}`));
            logger.info(chalk.cyanBright(
                `     -> ${this.definition.getPartitionString() || 'none'}`));
        }

        if (!isEqual(this.existingIndex.condition || '',
            this.definition.condition || '')) {
            logger.info(
                chalk.cyanBright(
                    `  Cond: ${this.existingIndex.condition || 'none'}`));
            logger.info(
                chalk.cyanBright(
                    `     -> ${this.definition.condition || 'none'}`));
        }

        let hasReplica = Math.max(this.definition.num_replica,
                                  this.existingIndex.num_replica) > 0;
        if (!this.definition.manual_replica && hasReplica) {
            logger.info(
                chalk.cyanBright(
                    `  Repl: ${this.definition.num_replica}`));
        }

        if (this.withClause.nodes && this.existingIndex.nodes &&
            !isEqual(this.withClause.nodes, this.existingIndex.nodes)) {
            logger.info(chalk.cyanBright(
                ` Nodes: ${this.existingIndex.nodes.join()}`));
            logger.info(chalk.cyanBright(
                `    ->: ${this.withClause.nodes.join()}`));
        }
    }

    /** @inheritDoc */
    async execute(manager, logger) {
        let dropMutation =
            new DropIndexMutation(this.definition, this.name);
        await dropMutation.execute(manager, logger);

        let createMutation = new CreateIndexMutation(
            this.definition, this.name, this.withClause);
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
        // Safe if there are multiple replicas
        // As each update will run in its own phase
        return this.definition.manual_replica &&
            this.definition.num_replica > 0;
    }
}
