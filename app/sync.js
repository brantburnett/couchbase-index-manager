import {Cluster, PasswordAuthenticator, ClassicAuthenticator} from 'couchbase';
import {compact, extend} from 'lodash';
import fs from 'fs';
import path from 'path';
import util from 'util';
import yaml from 'js-yaml';
import chalk from 'chalk';
import {prompt} from 'inquirer';
import {Plan} from './plan';
import {IndexManager} from './index-manager';
import {IndexDefinition} from './index-definition';

const lstat = util.promisify(fs.lstat);
const readdir = util.promisify(fs.readdir);
const readFile = util.promisify(fs.readFile);

const INDEX_EXTENSIONS = ['.json', '.yaml'];

/**
 * @typedef ConnectionInfo
 * @property {string} cluster
 * @property {string} username
 * @property {string} password
 * @property {string} bucketName
 * @property {boolean} disableRbac
 * @property {?string} bucketPassword
 */

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
     * @param {ConnectionInfo} connectionInfo
     * @param {string} path Path to file or directory with index definitions
     * @param {SyncOptions} [options]
     */
    constructor(connectionInfo, path, options) {
        this.connectionInfo = connectionInfo;
        this.path = path;
        this.options = extend({logger: console}, options);
    }

    /**
     * Executes the synchronization
     */
    async execute() {
        this.bootstrap();

        try {
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
        } finally {
            this.close();
        }
    }

    /**
     * Creates the plan (must be bootstrapped)
     *
     * @return {Plan}
     */
    async createPlan() {
        const definitions = await this.loadDefinitions();

        if (definitions.length === 0) {
            this.options.logger.warn(
                chalk.yellowBright('No index definitions found'));
        }

        const currentIndexes = await this.manager.getIndexes();

        let mutations = compact(
            definitions.map(
                (definition) => definition.getMutation(currentIndexes)));

        if (this.options.safe) {
            mutations = mutations.filter((p) => !p.isSafe());
        }

        return new Plan(this.manager, mutations, this.options);
    }

    /**
     * Bootstraps the connection.  Automatically used by execute(),
     * but required if you're manually calling createPlan().
     */
    bootstrap() {
        this.cluster = new Cluster(this.connectionInfo.cluster);

        if (this.connectionInfo.disableRbac) {
            this.cluster.authenticate(new ClassicAuthenticator(
                {},
                this.connectionInfo.username,
                this.connectionInfo.password
            ));
        } else {
            this.cluster.authenticate(new PasswordAuthenticator(
                this.connectionInfo.username,
                this.connectionInfo.password));
        }

        this.bucket = this.cluster.openBucket(
            this.connectionInfo.bucketName,
            this.connectionInfo.bucketPassword);

        this.manager =
            new IndexManager(this.connectionInfo.bucketName, this.bucket);
    }

    /**
     * Closes the Couchbase connection.  Automatically used by execute(),
     * but required if you're manually calling createPlan().
    */
    close() {
        this.bucket.disconnect();
    }

    /**
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
     * Loads definitions from disk
     * @return {array.IndexDefinition}
     */
    async loadDefinitions() {
        let files;
        try {
            if ((await lstat(this.path)).isDirectory()) {
                files = await readdir(this.path);
            } else {
                files = [this.path];
            }
        } catch (e) {
            throw new Error('Path not found');
        }

        // Only look at specific file types
        files = files.filter((filename) =>
            INDEX_EXTENSIONS.includes(path.extname(filename).toLowerCase()));

        let definitions = [];
        for (let i=0; i<files.length; i++) {
            let filename = path.join(this.path, files[i]);

            await this.loadDefinition(filename, (def) => definitions.push(def));
        }

        return definitions;
    }

    /**
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
        } else if (ext === '.yaml') {
            yaml.safeLoadAll(contents, (doc) => {
                handler(IndexDefinition.fromObject(doc));
            });
        }
    }
}
