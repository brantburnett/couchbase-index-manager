import chalk from 'chalk';
import { IndexDefinition } from '../definition';
import { IndexManager } from '../index-manager';
import { IndexMutation } from './index-mutation';
import { Logger } from '../options';

/**
 * Represents an index mutation which updates an existing index
 */
export class MoveIndexMutation extends IndexMutation {
    /**
     * @param {IndexDefinition} definition Index definition
     * @param {string} name Name of the index to mutate
     * @param {boolean} unsupported
     *     If true, don't actually perform this mutation
     */
    constructor(definition: IndexDefinition, name: string, private unsupported: boolean) {
        super(definition, name);
    }

    print(logger: Logger): void {
        const color = this.unsupported ?
            chalk.yellowBright :
            chalk.cyanBright;

        logger.info(color(
            `  Move: ${this.name}`));

        logger.info(color(
            ` Nodes: ${this.definition.nodes.join()}`));

        if (this.unsupported) {
            logger.info(color(
                `  Skip: ALTER INDEX is not supported until CB 5.5`
            ));
        }
    }

    async execute(manager: IndexManager): Promise<void> {
        if (!this.unsupported) {
            await manager.moveIndex(this.name, this.definition.nodes);
        }
    }
}
