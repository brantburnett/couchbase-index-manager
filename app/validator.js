import {extend, isArrayLike} from 'lodash';
import chalk from 'chalk';
import {FeatureVersions} from './feature-versions';
import {DefinitionLoader} from './definition';

/**
 * @typedef ValidateOptions
 * @property {?object} logger Logger for printing information
 */

/**
 * Executes a synchronization, loading definitions from disk
 */
export class Validator {
    /**
     * @param {string | array.string} path
     *     Path or array of paths to files or directories with index definitions
     * @param {ValidateOptions} [options]
     */
    constructor(path, options) {
        this.paths = isArrayLike(path) ? Array.from(path) : [path];
        this.options = extend({logger: console}, options);
    }

    /**
     * Executes the synchronization
     *
     * @param  {IndexManager} [manager]
     */
    async execute(manager) {
        const definitionLoader = new DefinitionLoader(this.options.logger);
        const {definitions, nodeMap} =
            await definitionLoader.loadDefinitions(this.paths);

        if (manager) {
            await this.validateSyntax(manager, definitions, nodeMap);
        }

        this.options.logger.log(
            chalk.greenBright('Definitions validated, no errors found.'));
    }

    /**
     * @private
     * Uses EXPLAIN to validate syntax of the CREATE INDEX statement.
     *
     * @param {IndexManager} manager
     * @param {array.IndexDefinition} definitions
     * @param {NodeMap} nodeMap
     */
    async validateSyntax(manager, definitions, nodeMap) {
        const clusterVersion = await manager.getClusterVersion();

        if (!FeatureVersions.autoReplicas(clusterVersion)) {
            // Force all definitions to use manual replica management
            definitions.forEach((def) => {
                def.manual_replica = true;
            });
        }

        nodeMap.apply(definitions);

        for (let definition of definitions) {
            let statement = definition.getCreateStatement(
                manager.bucketName, '__cbim_validate');

            try {
                // Use an EXPLAIN CREATE INDEX statement to validate the syntax.
                // So long as there is no real index named __cbim_validate, this
                // will ensure the condition syntax, etc, is correct.

                await manager.getQueryPlan(statement);
            } catch (e) {
                throw new Error(
                    `Invalid index definition for ${this.name}: ${e.message}`);
            }
        }
    }
}
