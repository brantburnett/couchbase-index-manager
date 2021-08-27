import chalk from 'chalk';
import { isEqual } from 'lodash';
import { CreateIndexMutation } from './create-index-mutation';
import { DropIndexMutation } from './drop-index-mutation';
import { IndexDefinition } from '../index-definition';
import { CouchbaseIndex, IndexManager, WithClause } from '../index-manager';
import { IndexMutation } from './index-mutation';
import { Logger } from '../options';

/**
 * Represents an index mutation which updates an existing index
 */
export class UpdateIndexMutation extends IndexMutation {
    private withClause: WithClause;

    constructor(definition: IndexDefinition, name: string, withClause: WithClause, private existingIndex: CouchbaseIndex) {
        super(definition, name);

        this.withClause = withClause || {};
    }

    print(logger: Logger): void {
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

        if (this.definition.partition || this.existingIndex.partition) {
            if (!isEqual(this.existingIndex.partition || '',
                this.definition.getPartitionString())) {
                logger.info(chalk.cyanBright(
                    `  Part: ${this.existingIndex.partition || 'none'}`));
                logger.info(chalk.cyanBright(
                    `     -> ${this.definition.getPartitionString() || 'none'}`));
            }

            if (this.definition.partition &&
                this.definition.partition.num_partition &&
                this.existingIndex.num_partition !==
                    this.definition.partition.num_partition) {
                logger.info(chalk.cyanBright(
                    `# Part: ${this.existingIndex.num_partition}`));
                logger.info(chalk.cyanBright(
                    `     -> ${this.definition.partition.num_partition}`));
            }
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

        const hasReplica = Math.max(this.definition.num_replica,
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

        if (!isEqual(!!this.withClause.retain_deleted_xattr,
            this.existingIndex.retain_deleted_xattr)) {
            logger.info(chalk.cyanBright(
                ` XATTR: ${this.existingIndex.retain_deleted_xattr}`));
            logger.info(chalk.cyanBright(
                `    ->: ${!!this.withClause.retain_deleted_xattr}`));
        }
    }

    /** @inheritDoc */
    async execute(manager: IndexManager, logger: Logger): Promise<void> {
        const dropMutation =
            new DropIndexMutation(this.definition, this.name);
        await dropMutation.execute(manager, logger);

        const createMutation = new CreateIndexMutation(
            this.definition, this.name, this.withClause);
        await createMutation.execute(manager, logger);
    }

    /**
     * Formats a list of keys for human readable output
     */
    private formatKeys(index: { index_key: string[] }): string {
        return index.index_key.join(',');
    }

    isSafe(): boolean {
        // Safe if there are multiple replicas
        // As each update will run in its own phase
        return this.definition.manual_replica &&
            this.definition.num_replica > 0;
    }
}
