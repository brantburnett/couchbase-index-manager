import chalk from 'chalk';
import { IndexDefinition } from '../definition';
import { IndexManager } from '../index-manager';
import { IndexMutation } from './index-mutation';
import { Logger } from '../options';

/**
 * Represents an index mutation which updates an existing index
 */
export class MoveIndexMutation extends IndexMutation {
    private nodes: string[];

    constructor(definition: IndexDefinition, name: string) {
        super(definition, name);

        if (!definition.nodes) {
            throw new Error('Missing nodes on IndexDefinition');
        }

        this.nodes = definition.nodes;
    }

    print(logger: Logger): void {
        logger.info(chalk.cyanBright(
            `  Move: ${this.displayName}`));

        logger.info(chalk.cyanBright(
            ` Nodes: ${this.nodes.join()}`));
    }

    async execute(manager: IndexManager): Promise<void> {
        await manager.moveIndex(this.name, this.scope, this.collection, this.nodes);
    }
}
