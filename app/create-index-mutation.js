import {IndexMutation} from './index-mutation';
import chalk from 'chalk';

/**
 * Represents an index mutation which is creating a new index
 */
export class CreateIndexMutation extends IndexMutation {
    /**
     * @param {IndexDefinition} definition Index definition
     * @param {?string} name Name fo the index to mutate
     * @param {?Object<string, *>} withClause
     *     Additional clauses for index creation
     */
    constructor(definition, name, withClause) {
        super(definition, name);

        this.withClause = withClause || {};
    }

    /** @inheritDoc */
    print(logger) {
        logger.info(chalk.greenBright(`Create: ${this.name}`));

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

    /** @inheritDoc */
    async execute(indexManager, logger) {
        logger.info(chalk.greenBright(`Creating ${this.name}...`));

        let statement = this.definition.getCreateStatement(
            indexManager.bucketName, this.name, this.withClause
        );

        await indexManager.createIndex(statement);
    }
}
