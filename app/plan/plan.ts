import chalk from 'chalk';
import { padStart, flatten } from 'lodash';
import { IndexManager } from '../index-manager';
import { IndexMutation } from './index-mutation';
import { Logger } from '../options';

export interface PlanOptions {
    /**
     * logger for output
     */
    logger: Logger;

    /**
     * Milliseconds to wait for indexes to build
     */
    buildTimeout?: number;

    /**
     * Milliseconds to wait before building indexes
     */
    buildDelay: number;
}

/**
 * Adds mutations to a collection already grouped by phase
 */
function addMutationsByPhase(mutations: IndexMutation[], currentMutations: IndexMutation[][]): IndexMutation[][] {
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

const defaultOptions: PlanOptions = {
    logger: console,
    buildDelay: 3000,
};

/**
 * Represents a planned set of mutations for synchronization
 */
export class Plan {
    private options: PlanOptions;
    private mutations: IndexMutation[][];

    constructor(private manager: IndexManager, mutations: IndexMutation[], options?: Partial<PlanOptions>) {
        this.options = {
            ...defaultOptions,
            ...options
        };

        this.mutations = addMutationsByPhase(mutations, []);
    }

    /**
     * Returns true if the plan is empty
     */
    isEmpty(): boolean {
        return this.mutations.length === 0;
    }

    /**
     * Prints the plan
     */
    print(): void {
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
    async execute(): Promise<void> {
        let errorCount = 0;
        let skipCount = 0;

        for (const phase of this.mutations) {
            if (phase.length <= 0) {
                continue;
            }

            const phaseNum = phase[0].phase;

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

            // Wait 3 seconds for index nodes to synchronize before building
            // This helps to reduce race conditions
            // https://github.com/brantburnett/couchbase-index-manager/issues/35
            if (this.options.buildDelay > 0) {
                await new Promise((resolve) =>
                    setTimeout(resolve, this.options.buildDelay));
            }
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
            const msg =
                `Plan failed with ${errorCount} errors, ${skipCount} skipped`;
            throw new Error(msg);
        } else {
            const msg = `Plan completed with ${errorCount} errors`;
            throw new Error(msg);
        }
    }

    /**
     * Adds mutations to the plan
     */
    addMutation(...mutations: IndexMutation[]): void {
        addMutationsByPhase(mutations, this.mutations);
    }

    /**
     * When running in Kubernetes and attaching to logs, there is a five
     * minute timeout if there is no console output.  This tick handler
     * ensures that output continues during that time.
     */
    private indexBuildTickHandler(milliseconds: number): void {
        const secs = milliseconds / 1000;
        const secsPart = padStart(Math.floor(secs % 60).toString(10), 2, '0');
        const minsPart = Math.floor(secs / 60);

        this.options.logger.log(chalk.greenBright(
            `Building ${minsPart}m${secsPart}s...`
        ));
    }
}
