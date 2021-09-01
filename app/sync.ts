import chalk from 'chalk';
import { prompt } from 'inquirer';
import { compact, extend, flatten, isArrayLike } from 'lodash';
import { DefinitionLoader } from './definition';
import { IndexManager } from './index-manager';
import { SyncOptions } from './options';
import { Plan } from './plan';

/**
 * Executes a synchronization, loading definitions from disk
 */
export class Sync {
    private paths: string[];
    private options: SyncOptions;

    constructor(private manager: IndexManager, path: string | ArrayLike<string>, options?: SyncOptions) {
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
    async execute(): Promise<void> {
        const plan = await this.createPlan();
        const options = this.options;

        if (options.interactive) {
            plan.print();
        }

        if (options.dryRun || plan.isEmpty()) {
            return;
        } else if (options.interactive && options.confirmationPrompt) {
            if (!(await this.confirm())) {
                options.logger?.info(
                    chalk.yellowBright('Cancelling due to user input...'));
                return;
            }
        }

        await plan.execute();
    }

    /**
     * Creates the plan
     */
    async createPlan(): Promise<Plan> {
        const definitionLoader = new DefinitionLoader(this.options.logger);
        const {definitions, nodeMap} =
            await definitionLoader.loadDefinitions(this.paths);

        if (definitions.length === 0) {
            this.options.logger?.warn(
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

        // Normalize the definitions before testing for mutations
        for (const def of definitions) {
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
     * Presents a confirmation prompt before executing the plan
    */
    private async confirm(): Promise<boolean> {
        const answers = await prompt({
            name: 'confirm',
            type: 'confirm',
            message: 'Execute index sync plan?',
        });

        return !!answers.confirm;
    }
}
