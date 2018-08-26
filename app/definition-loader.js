import chalk from 'chalk';
import fs from 'fs';
import {forOwn, isObjectLike} from 'lodash';
import path from 'path';
import util from 'util';
import yaml from 'js-yaml';
import {IndexDefinition, IndexValidators} from './index-definition';
import {NodeMap, NodeMapValidators} from './node-map';

// Ensure that promisify is available on Node 6
require('util.promisify').shim();

const lstat = util.promisify(fs.lstat);
const readdir = util.promisify(fs.readdir);
const readFile = util.promisify(fs.readFile);

const INDEX_EXTENSIONS = ['.json', '.yaml', '.yml'];

/**
 * Set of validators, keyed by type and then by property.  Each validator
 * may throw an exception if that property is in error.  First parameter
 * is the value of that property.  "this" will be the definition.
 *
 * May also include a "post_validate" validator, which is called last
 * and without a parameter.  This validator is used to validate the object
 * as a whole, to ensure property values compatible with each other.
 */
const validatorSets = {
    'nodeMap': NodeMapValidators,
    'index': IndexValidators,
};

/**
 * Loads index definitions from disk or stdin
 */
export class DefinitionLoader {
    /**
     * @param {any} [logger]
     */
    constructor(logger) {
        this.logger = logger || console;
    }

    /**
     * Loads definitions from disk
     *
     * @param  {array.string} paths
     * @return {{definitions: array.IndexDefinition, nodeMap: NodeMap}}
     */
    async loadDefinitions(paths) {
        let definitions = [];
        let nodeMap = new NodeMap();

        let files = [];
        for (let filePath of paths) {
            if (filePath === '-') {
                // read from stdin
                await this.loadFromStdIn(
                    (def) => this.processDefinition(definitions, nodeMap, def));

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
            await this.loadDefinition(files[i],
                (def) => this.processDefinition(definitions, nodeMap, def));
        }

        return {
            definitions,
            nodeMap,
        };
    }

    /**
     * @private
     * Loads index definitions from a file
     *
     * @param {string} filename File to read
     * @param {function(*)} handler Handler for loaded definitions
     */
    async loadDefinition(filename, handler) {
        let ext = path.extname(filename).toLowerCase();
        let contents = await readFile(filename, 'utf8');

        if (ext === '.json') {
            handler(JSON.parse(contents));
        } else if (ext === '.yaml' || ext === '.yml') {
            yaml.safeLoadAll(contents, handler);
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
                        handler(JSON.parse(data));
                    } else {
                        // Assume it's YAML
                        yaml.safeLoadAll(data, handler);
                    }

                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
        });
    }

    /**
     * @private
     * Processes a definition and adds to the current definitions or
     *     applies overrides to the matching definition
     *
     * @param {array.IndexDefinition} definitions Current definitions
     * @param {NodeMap} nodeMap Current node map
     * @param {*} definition New definition to process
     */
    processDefinition(definitions, nodeMap, definition) {
        let match = definitions.find((p) => p.name === definition.name);

        if (definition.type === undefined) {
            definition.type = 'index';
        }

        this.validateDefinition(definition, match);

        if (definition.type === 'nodeMap') {
            if (definition.map && isObjectLike(definition.map)) {
                nodeMap.merge(definition.map);
            } else {
                throw new Error('Invalid nodeMap');
            }
        } else if (definition.type === 'override') {
            // Override definition
            if (match) {
                match.applyOverride(definition);
            } else {
                // Ignore overrides with no matching index
                this.logger.warn(
                    chalk.yellowBright(
                        `No index definition found '${definition.name}'`));
            }
        } else if (definition.type === 'index') {
            // Regular index definition

            if (match) {
                throw new Error(
                    `Duplicate index definition '${definition.name}'`);
            }

            definitions.push(new IndexDefinition(definition));
        } else {
            throw new Error(`Unknown definition type '${definition.type}'`);
        }
    }

    /**
     * @private
     * Validates a definition based on its type, throwing an exception
     * if there is a problem.
     *
     * @param {*} definition
     * @param {IndexDefinition} [match]
     *     Existing index definition of the same name, if any
     */
    validateDefinition(definition, match) {
        let effectiveType = definition.type;
        if (effectiveType === 'override' && match) {
            // Use validators based on the type of definition being overriden

            if (match instanceof IndexDefinition) {
                effectiveType = 'index';
            }
        }

        const validatorSet = validatorSets[effectiveType];
        if (validatorSet) {
            forOwn(validatorSet, (validator, key) => {
                try {
                    if (key !== 'post_validate') {
                        validator.call(definition, definition[key]);
                    }
                } catch (e) {
                    throw new Error(
                        `${e} in ${definition.name || 'unk'}.${key}`);
                }
            });

            // Don't perform post_validate step on overrides, as overrides
            // don't have the full set of properties.
            if (validatorSet.post_validate && definition.type !== 'override') {
                try {
                    validatorSet.post_validate.call(definition);
                } catch (e) {
                    throw new Error(
                        `${e} in ${definition.name || 'unk'}`);
                }
            }
        }
    }
}
