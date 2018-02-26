import {IndexMutation} from './index-mutation';
import chalk from 'chalk';

/**
 * Represents an index mutation which drops an existing index
 */
export class DropIndexMutation extends IndexMutation {
    /** @inheritdoc */
    print(logger) {
        logger.info(chalk.redBright(`Delete: ${this.name}`));
    }

    /** @inheritdoc */
    async execute(indexManager, logger) {
        logger.info(chalk.redBright(`Deleting ${this.name}...`));

        await indexManager.dropIndex(this.name);
    }

    /** @inheritdoc */
    isSafe() {
        return false;
    }
}
