import {compact, flatten, extend, isArrayLike} from 'lodash';
import fs from 'fs';
import path from 'path';
import util from 'util';
import yaml from 'js-yaml';
import chalk from 'chalk';
import {prompt} from 'inquirer';
import {Plan} from './plan';
import {IndexDefinition} from './index-definition';

// Ensure that promisify is available on Node 6
require('util.promisify').shim();

const lstat = util.promisify(fs.lstat);
const readdir = util.promisify(fs.readdir);
const readFile = util.promisify(fs.readFile);

const INDEX_EXTENSIONS = ['.json', '.yaml', '.yml'];

/**
 * @typedef SyncOptions
 * @property {?boolean} safe Execute a safe synchronization
 * @property {?boolean} dryRun Execute a dry run only
 * @property {?boolean} interactive Print interactive information to logger
 * @property {?boolean} confirmationPrompt Confirma with user before execute
 * @property {?number} buildTimeout Milliseconds to wait for indexes to build
 * @property {?object} logger Logger for printing information
 */

/**
 * Executes a synchronization, loading definitions from disk
 */
export class Sync {
    /**
     * @param {IndexManager} manager
     * @param {string | array.string} path
     *     Path or array of paths to files or directories with index definitions
     * @param {SyncOptions} [options]
     */
    constructor(manager, path, options) {
        this.manager = manager;
        this.paths = isArrayLike(path) ? Array.from(path) : [path];
        this.options = extend({logger: console}, options);
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
        const definitions = await this.loadDefinitions();

        if (definitions.length === 0) {
            this.options.logger.warn(
                chalk.yellowBright('No index definitions found'));
        }

        if (definitions.filter((def) => def.is_primary).length > 1) {
            throw new Error('Cannot define more than one primary index');
        }

        const currentIndexes = await this.manager.getIndexes();

        let mutations = compact(flatten(
            definitions.map((definition) => Array.from(definition.getMutations(
                currentIndexes,
                this.manager.is4XCluster)))));

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

    /**
     * @private
     * Loads definitions from disk
     *
     * @return {array.IndexDefinition}
     */
    async loadDefinitions() {
        let definitions = [];

        let files = [];
        for (let filePath of this.paths) {
            if (filePath === '-') {
                // read from stdin

                await this.loadFromStdIn((def) => definitions.push(def));

                // Can't do interactive prompts if processing from stdin
                this.options.interactive = false;

                continue;
            }

            try {
                if ((await lstat(filePath)).isDirectory()) {
                    let filesInDir = await readdir(filePath);
                    let joinedFilesInDir = filesInDir.map(
                        (fileName) => path.join(filePath, fileName));

                    files.push(...joinedFilesInDir);
                } else {
                    files.push(filePath);
                }
            } catch (e) {
                throw new Error('Path not found');
            }
        }

        // Only look at specific file types
        files = files.filter((filename) =>
            INDEX_EXTENSIONS.includes(path.extname(filename).toLowerCase()));

        for (let i=0; i<files.length; i++) {
            await this.loadDefinition(files[i], (def) => definitions.push(def));
        }

        return definitions;
    }

    /**
     * @private
     * Loads index definitions from a file
     *
     * @param {string} filename File to read
     * @param {function(IndexDefinition)} handler Handler for loaded definitions
     */
    async loadDefinition(filename, handler) {
        let ext = path.extname(filename).toLowerCase();
        let contents = await readFile(filename, 'utf8');

        if (ext === '.json') {
            handler(IndexDefinition.fromObject(JSON.parse(contents)));
        } else if (ext === '.yaml' || ext === '.yml') {
            yaml.safeLoadAll(contents, (doc) => {
                handler(IndexDefinition.fromObject(doc));
            });
        }
    }

    /**
     * @private
     * Loads index definitions from stdin
     *
     * @param {function(IndexDefinition)} handler Handler for loaded definitions
     * @return {Promise}
     */
    loadFromStdIn(handler) {
        return new Promise((resolve, reject) => {
            process.stdin.resume();
            process.stdin.setEncoding('utf8');

            let data = '';
            process.stdin.on('data', (chunk) => {
                data += chunk;
            });

            process.stdin.on('end', () => {
                try {
                    if (data.match(/^\s*{/)) {
                        // Appears to be JSON
                        handler(IndexDefinition.fromObject(JSON.parse(data)));
                    } else {
                        // Assume it's YAML
                        yaml.safeLoadAll(data, (doc) => {
                            handler(IndexDefinition.fromObject(doc));
                        });
                    }

                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
        });
    }
}
