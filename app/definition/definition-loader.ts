import chalk from 'chalk';
import fs from 'fs';
import yaml from 'js-yaml';
import { isObjectLike } from 'lodash';
import path from 'path';
import util from 'util';
import { ConfigurationItem, ConfigurationType, IndexConfigurationBase, IndexValidators, isIndex, isNodeMap, isOverride, NodeMapConfiguration, NodeMapValidators, ValidatorSet } from '../configuration';
import { Logger } from '../options';
import { IndexDefinition } from './index-definition';
import { NodeMap } from './node-map';

const lstat = util.promisify(fs.lstat);
const readdir = util.promisify(fs.readdir);
const readFile = util.promisify(fs.readFile);

const INDEX_EXTENSIONS = ['.json', '.yaml', '.yml'];

type ConfigItemHandler = (item: ConfigurationItem) => void;

function validateDefinition<T>(validatorSet: ValidatorSet<T>, definition: T) {
    let key: keyof ValidatorSet<T>;
    for (key in validatorSet) {
        try {
            if (key !== 'post_validate') {
                validatorSet[key].call(definition, definition[key]);
            }
        } catch (e) {
            throw new Error(
                `${e} in ${(definition as any).name || 'unk'}.${key}`);
        }
    }

    // Don't perform post_validate step on overrides, as overrides
    // don't have the full set of properties.
    if (validatorSet.post_validate && !isOverride(definition as unknown as ConfigurationItem)) {
        try {
            validatorSet.post_validate.call(definition);
        } catch (e) {
            throw new Error(
                `${e} in ${(definition as any).name || 'unk'}`);
        }
    }
}

/**
 * Loads index definitions from disk or stdin
 */
export class DefinitionLoader {
    private logger: Logger;

    constructor(logger?: Logger) {
        this.logger = logger || console;
    }

    /**
     * Loads definitions from disk
     */
    async loadDefinitions(paths: string[]): Promise<{ definitions: IndexDefinition[], nodeMap: NodeMap }> {
        const definitions: IndexDefinition[] = [];
        const nodeMap = new NodeMap();

        let files = [];
        for (const filePath of paths) {
            if (filePath === '-') {
                // read from stdin
                await this.loadFromStdIn(
                    (def) => this.processDefinition(definitions, nodeMap, def));

                continue;
            }

            try {
                if ((await lstat(filePath)).isDirectory()) {
                    const filesInDir = await readdir(filePath);
                    const joinedFilesInDir = filesInDir.map(
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
     * Loads index definitions from a file
     */
    private async loadDefinition(filename: string, handler: ConfigItemHandler): Promise<void> {
        const ext = path.extname(filename).toLowerCase();
        const contents = await readFile(filename, 'utf8');

        if (ext === '.json') {
            handler(JSON.parse(contents));
        } else if (ext === '.yaml' || ext === '.yml') {
            yaml.loadAll(contents, handler);
        }
    }

    /**
     * @private
     * Loads index definitions from stdin
     */
    private loadFromStdIn(handler: ConfigItemHandler): Promise<void> {
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
                        yaml.loadAll(data, handler);
                    }

                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
        });
    }

    /**
     * Processes a definition and adds to the current definitions or
     *     applies overrides to the matching definition
     */
    private processDefinition(definitions: IndexDefinition[], nodeMap: NodeMap, definition: ConfigurationItem): void {
        const match = definitions.find((p) => p.name === (definition as any).name);

        if (definition.type === undefined) {
            definition.type = ConfigurationType.Index;
        }

        this.validateDefinition(definition, match);

        if (isNodeMap(definition)) {
            if (definition.map && isObjectLike(definition.map)) {
                nodeMap.merge(definition.map);
            } else {
                throw new Error('Invalid nodeMap');
            }
        } else if (isOverride(definition)) {
            // Override definition
            if (match) {
                match.applyOverride(definition);
            } else {
                // Ignore overrides with no matching index
                this.logger.warn(
                    chalk.yellowBright(
                        `No index definition found '${definition.name}'`));
            }
        } else if (isIndex(definition)) {
            // Regular index definition

            if (match) {
                throw new Error(
                    `Duplicate index definition '${definition.name}'`);
            }

            definitions.push(new IndexDefinition(definition));
        } else {
            throw new Error(`Unknown definition type '${(definition as any).type}'`);
        }
    }

    /**
     * Validates a definition based on its type, throwing an exception
     * if there is a problem.
     */
    private validateDefinition(definition: ConfigurationItem, match?: IndexDefinition) {
        let effectiveType = definition.type;
        if (effectiveType === ConfigurationType.Override && match) {
            // Use validators based on the type of definition being overriden

            if (match instanceof IndexDefinition) {
                effectiveType = ConfigurationType.Index;
            }
        }

        switch (effectiveType) {
            case ConfigurationType.Index:
                validateDefinition(IndexValidators, definition as IndexConfigurationBase);
                break;

            case ConfigurationType.NodeMap:
                validateDefinition(NodeMapValidators, definition as NodeMapConfiguration);
                break;
        }
    }
}