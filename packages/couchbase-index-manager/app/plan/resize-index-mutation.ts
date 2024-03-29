import chalk from 'chalk';
import { IndexDefinition } from '../definition';
import { IndexManager } from '../index-manager';
import { IndexMutation } from './index-mutation';
import { Logger } from '../options';

/**
 * Represents an index mutation which resizes an existing index to a different number of replicas
 */
export class ResizeIndexMutation extends IndexMutation {
    constructor(definition: IndexDefinition, name: string) {
        super(definition, name);
    }

    /** @inheritDoc */
    print(logger: Logger): void {
        const color = chalk.cyanBright;

        logger.info(color(
            `Resize: ${this.displayName}`));

        logger.info(color(
            `  Repl: ${this.definition.num_replica}`));

        if (this.definition.nodes) {
            logger.info(color(
                ` Nodes: ${this.definition.nodes.join()}`));
        }
    }

    async execute(manager: IndexManager): Promise<void> {
        await manager.resizeIndex(this.name, this.scope, this.collection, this.definition.num_replica ?? 0, this.definition.nodes);
    }
}
