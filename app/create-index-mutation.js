import {IndexMutation} from './index-mutation';
import chalk from 'chalk';

/**
 * Represents an index mutation which is creating a new index
 */
export class CreateIndexMutation extends IndexMutation {
    /** @inheritDoc */
    print(logger) {
        logger.info(chalk.greenBright(`Create: ${this.definition.name}`));
        logger.info(
            chalk.greenBright(
                `  Keys: ${this.definition.index_key.join(', ')}`));

        if (this.definition.condition) {
            logger.info(
                chalk.greenBright(
                    `  Cond: ${this.definition.condition}`));
        }

        if (this.definition.num_replica > 0) {
            logger.info(
                chalk.greenBright(
                    `  Repl: ${this.definition.num_replica}`));
        }
    }

    /** @inheritDoc */
    async execute(indexManager, logger) {
        logger.info(chalk.greenBright(`Creating ${this.definition.name}...`));

        await indexManager.createIndex(this.definition);
    }
}
