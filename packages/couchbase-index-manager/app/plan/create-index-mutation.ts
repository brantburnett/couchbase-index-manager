import chalk from 'chalk';
import { IndexDefinition } from '../definition';
import { IndexManager, WithClause } from '../index-manager';
import { IndexMutation } from './index-mutation';
import { Logger } from '../options';

/**
 * Represents an index mutation which is creating a new index
 */
export class CreateIndexMutation extends IndexMutation {
    public withClause: WithClause;

    constructor(definition: IndexDefinition, name?: string, withClause?: WithClause) {
        super(definition, name);

        this.withClause = withClause || {};
    }

    print(logger: Logger): void {
        logger.info(chalk.greenBright(`Create: ${this.displayName}`));

        if (this.definition.is_primary) {
            logger.info(
                chalk.greenBright(
                    `  Keys: PRIMARY`));
        } else {
            logger.info(
                chalk.greenBright(
                    `  Keys: ${this.definition.index_key.join(', ')}`));
        }

        if (this.definition.condition) {
            logger.info(
                chalk.greenBright(
                    `  Cond: ${this.definition.condition}`));
        }

        if (this.definition.partition) {
            logger.info(
                chalk.greenBright(
                    `  Part: ${this.definition.getPartitionString()}`));

            if (this.definition.partition.num_partition) {
                logger.info(
                    chalk.greenBright(
                        `# Part: ${this.definition.partition.num_partition}`));
            }
        }

        if (this.definition.num_replica > 0 &&
            !this.definition.manual_replica) {
            logger.info(
                chalk.greenBright(
                    `  Repl: ${this.definition.num_replica}`));
        }

        if (this.withClause.nodes) {
            logger.info(chalk.greenBright(
                ` Nodes: ${this.withClause.nodes.join()}`));
        }

        if (this.withClause.retain_deleted_xattr) {
            logger.info(chalk.greenBright(
                ' XATTR: true'));
        }
    }

    async execute(indexManager: IndexManager, logger: Logger): Promise<void> {
        logger.info(chalk.greenBright(`Creating ${this.displayName}...`));

        const statement = this.definition.getCreateStatement(
            indexManager.bucketName, this.name, this.withClause
        );

        await indexManager.createIndex(statement);
    }
}
