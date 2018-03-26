import {extend, padStart} from 'lodash';
import chalk from 'chalk';

/**
 * @typedef PlanOptions
 * @property {?logger} logger logger for output
 * @property {?number} buildTimeout Milliseconds to wait for indexes to build
 */

/**
 * Represents a planned set of mutations for synchronization
 */
export class Plan {
    /**
     * @param {IndexManager} manager
     * @param {array.IndexMutation} [mutations]
     * @param {PlanOptions} [options]
     */
    constructor(manager, mutations, options) {
        this.manager = manager;
        this.mutations = mutations || [];
        this.options = extend({logger: console}, options);
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

        this.mutations.forEach((mutation) => {
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

        for (let i=0; i<this.mutations.length; i++) {
            try {
                await this.mutations[i].execute(
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

        if (errorCount === 0) {
            this.options.logger.info(
                chalk.greenBright('Plan completed'));

            this.options.logger.info();
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
        this.mutations.push(...mutations);
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
