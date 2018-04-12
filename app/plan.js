import {extend, padStart, flatten} from 'lodash';
import chalk from 'chalk';

/**
 * @typedef PlanOptions
 * @property {?logger} logger logger for output
 * @property {?number} buildTimeout Milliseconds to wait for indexes to build
 */

 /**
  * Adds mutations to a collection already grouped by phase
  * @param  {array.Mutation} mutations
  * @param  {array.array.Mutation} currentMutations
  * @return {array.array.Mutation}
  */
function addMutationsByPhase(mutations, currentMutations) {
    mutations.reduce((accumulator, mutation) => {
        const phase = mutation.phase - 1;

        if (!accumulator[phase]) {
            accumulator[phase] = [];
        }

        accumulator[phase].push(mutation);

        return accumulator;
    }, currentMutations);

    return currentMutations;
}

/**
 * Represents a planned set of mutations for synchronization
 *
 * @private @property {IndexManager} manager
 * @private @property {array.array.Mutation} mutations
 * @private @property {PlanOptions} options
 */
export class Plan {
    /**
     * @param {IndexManager} manager
     * @param {array.IndexMutation} [mutations]
     * @param {PlanOptions} [options]
     */
    constructor(manager, mutations, options) {
        this.manager = manager;
        this.options = extend({logger: console}, options);

        this.mutations = addMutationsByPhase(mutations, []);
    }

    /**
     * Returns true if the plan is empty
     * @return {boolean}
     */
    isEmpty() {
        return this.mutations.length === 0;
    }

    /**
     * Prints the plan
     */
    print() {
        if (this.isEmpty()) {
            this.options.logger.info(
                chalk.yellowBright('No mutations to be performed'));
            return;
        }

        this.options.logger.info();
        this.options.logger.info('Index sync plan:');
        this.options.logger.info();

        flatten(this.mutations).forEach((mutation) => {
            mutation.print(this.options.logger);

            // Add blank line
            this.options.logger.info();
        });
    }

    /**
     * Executes the plan
     */
    async execute() {
        let errorCount = 0;
        let skipCount = 0;

        for (let phase of this.mutations) {
            if (phase.length <= 0) {
                continue;
            }

            let phaseNum = phase[0].phase;

            if (errorCount > 0) {
                // Skip this phase if there are errors
                this.options.logger.info(chalk.yellowBright(
                    `Skipping phase ${phaseNum} (${phase.length} tasks)`));
                skipCount += phase.length;
                break;
            } else {
                this.options.logger.info(chalk.greenBright(
                    `Executing phase ${phaseNum}...`));
            }

            for (let i=0; i<phase.length; i++) {
                try {
                    await phase[i].execute(
                        this.manager, this.options.logger);
                } catch (e) {
                    this.options.logger.error(chalk.redBright(e));
                    errorCount++;
                }
            }

            this.options.logger.info(
                chalk.greenBright('Building indexes...'));
            await this.manager.buildDeferredIndexes();

            if (!await this.manager.waitForIndexBuild(
                this.options.buildTimeout, this.indexBuildTickHandler, this)) {
                this.options.logger.warn(
                    chalk.yellowBright('Some indexes are not online'));
            }
        }

        if (errorCount === 0) {
            this.options.logger.info(
                chalk.greenBright('Plan completed'));

            this.options.logger.info();
        } else if (skipCount > 0) {
            let msg =
                `Plan failed with ${errorCount} errors, ${skipCount} skipped`;
            throw new Error(msg);
        } else {
            let msg = `Plan completed with ${errorCount} errors`;
            throw new Error(msg);
        }
    }

    /**
     * Adds mutations to the plan
     *
     * @param {IndexMutation} ...mutations
     */
    addMutation(...mutations) {
        addMutationsByPhase(mutations, this.mutations);
    }

    /**
     * @private
     * When running in Kubernetes and attaching to logs, there is a five
     * minute timeout if there is no console output.  This tick handler
     * ensures that output continues during that time.
     *
     * @param {number} milliseconds Milliseconds since the build wait started
     */
    indexBuildTickHandler(milliseconds) {
        let secs = milliseconds / 1000;
        let secsPart = padStart(Math.floor(secs % 60).toString(10), 2, '0');
        let minsPart = Math.floor(secs / 60);

        this.options.logger.log(chalk.greenBright(
            `Building ${minsPart}m${secsPart}s...`
        ));
    }
}
