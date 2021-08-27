import {compact, flatten, extend, isArrayLike} from 'lodash';
import chalk from 'chalk';
import {prompt} from 'inquirer';
import {Plan} from './plan/plan';
import {FeatureVersions} from './feature-versions';
import {DefinitionLoader} from './definition-loader';

/**
 * Executes a synchronization, loading definitions from disk
 */
export class Sync {
    /**
     * @param {IndexManager} manager
     * @param {string | array.string} path
     *     Path or array of paths to files or directories with index definitions
     * @param {object} [options]
     */
    constructor(manager, path, options) {
        this.manager = manager;
        this.paths = isArrayLike(path) ? Array.from(path) : [path];
        this.options = extend({logger: console}, options);

        if (this.paths.find((p) => p === '-')) {
            // Can't do interactive prompts if processing from stdin
            this.options.interactive = false;
        }
    }

    /**
     * Executes the synchronization
     */
    async execute() {
        let plan = await this.createPlan();
        let options = this.options;

        if (options.interactive) {
            plan.print();
        }

        if (options.dryRun || plan.isEmpty()) {
            return;
        } else if (options.interactive && options.confirmationPrompt) {
            if (!(await this.confirm())) {
                options.logger.info(
                    chalk.yellowBright('Cancelling due to user input...'));
                return;
            }
        }

        await plan.execute();
    }

    /**
     * Creates the plan
     *
     * @return {Plan}
     */
    async createPlan() {
        const definitionLoader = new DefinitionLoader(this.options.logger);
        const {definitions, nodeMap} =
            await definitionLoader.loadDefinitions(this.paths);

        if (definitions.length === 0) {
            this.options.logger.warn(
                chalk.yellowBright('No index definitions found'));
        }

        if (definitions.filter((def) => def.is_primary).length > 1) {
            throw new Error('Cannot define more than one primary index');
        }

        // Apply the node map
        nodeMap.apply(definitions);

        const mutationContext = {
            currentIndexes: await this.manager.getIndexes(),
            clusterVersion: await this.manager.getClusterVersion(),
        };

        if (!FeatureVersions.autoReplicas(mutationContext.clusterVersion)) {
            // Force all definitions to use manual replica management
            definitions.forEach((def) => {
                def.manual_replica = true;
            });
        }

        // Normalize the definitions before testing for mutations
        for (let def of definitions) {
            if (def.partition) {
                let strategy = def.partition.strategy || 'HASH';

                if (!FeatureVersions.partitionBy(
                    mutationContext.clusterVersion, strategy)) {
                    throw new Error(
                        `Partition strategy '${strategy}' is not supported`);
                }
            }

            await def.normalize(this.manager);
        }

        let mutations = compact(flatten(
            definitions.map((definition) => Array.from(definition.getMutations(
                mutationContext)))));

        if (this.options.safe) {
            mutations = mutations.filter((p) => !p.isSafe());
        }

        return new Plan(this.manager, mutations, this.options);
    }

    /**
     * @private
     * Presents a confirmation prompt before executing the plan
     *
     * @return {boolean} True if user selected yes
    */
    async confirm() {
        let answers = await prompt({
            name: 'confirm',
            type: 'confirm',
            message: 'Execute index sync plan?',
        });

        return answers.confirm;
    }
}
