import chalk from 'chalk';
import { extend, isArrayLike } from 'lodash';
import { DefinitionLoader, IndexDefinition, NodeMap } from './definition';
import { IndexManager } from './index-manager';
import { ValidateOptions } from './options';

/**
 * Executes a synchronization, loading definitions from disk
 */
export class Validator {
    private paths: string[];
    private options: ValidateOptions;

    constructor(path: string | ArrayLike<string>, options?: ValidateOptions) {
        this.paths = isArrayLike(path) ? Array.from(path) : [path];
        this.options = extend({logger: console}, options);
    }

    /**
     * Executes the synchronization
     */
    async execute(manager?: IndexManager): Promise<void> {
        const definitionLoader = new DefinitionLoader(this.options.logger);
        const {definitions, nodeMap} =
            await definitionLoader.loadDefinitions(this.paths);

        if (manager) {
            await this.validateSyntax(manager, definitions, nodeMap);
        }

        this.options.logger?.log(
            chalk.greenBright('Definitions validated, no errors found.'));
    }

    /**
     * Uses EXPLAIN to validate syntax of the CREATE INDEX statement.
     */
    private async validateSyntax(manager: IndexManager, definitions: IndexDefinition[], nodeMap: NodeMap) {
        nodeMap.apply(definitions);

        for (const definition of definitions) {
            const statement = definition.getCreateStatement(
                manager.bucketName, '__cbim_validate');

            try {
                // Use an EXPLAIN CREATE INDEX statement to validate the syntax.
                // So long as there is no real index named __cbim_validate, this
                // will ensure the condition syntax, etc, is correct.

                await manager.getQueryPlan(statement);
            } catch (e) {
                throw new Error(
                    `Invalid index definition for ${definition.name}: ${e.message}`);
            }
        }
    }
}
