import chalk from 'chalk';
import { IndexManager } from '../index-manager';
import { IndexMutation } from './index-mutation';
import { Logger } from '../options';

/**
 * Represents an index mutation which drops an existing index
 */
export class DropIndexMutation extends IndexMutation {
    print(logger: Logger): void {
        logger.info(chalk.redBright(`Delete: ${this.displayName}`));
    }

    async execute(indexManager: IndexManager, logger: Logger): Promise<void> {
        logger.info(chalk.redBright(`Deleting ${this.displayName}...`));

        await indexManager.dropIndex(this.name, this.scope, this.collection);
    }

    isSafe(): boolean {
        return false;
    }
}
