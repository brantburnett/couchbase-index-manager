import chalk from 'chalk';
import fs from 'fs';
import yaml from 'js-yaml';
import { isObjectLike } from 'lodash';
import path from 'path';
import util from 'util';
import { ConfigurationItem, ConfigurationType, IndexConfigurationBase, IndexValidators, isIndex, isNodeMap, isOverride, isSameIndex, NodeMapConfiguration, NodeMapValidators, ValidatorSet } from '../configuration';
import { Logger } from '../options';
import { IndexDefinition } from './index-definition';
import { NodeMap } from './node-map';

const lstat = util.promisify(fs.lstat);
const readdir = util.promisify(fs.readdir);
const readFile = util.promisify(fs.readFile);

const INDEX_EXTENSIONS = ['.json', '.yaml', '.yml'];

type ConfigItemHandler = (item: ConfigurationItem) => void;

function validateConfiguration<T>(validatorSet: ValidatorSet<T>, configuration: T) {
    let key: keyof ValidatorSet<T>;
    for (key in validatorSet) {
        try {
            if (key !== 'post_validate') {
                validatorSet[key]?.call(configuration, configuration[key]);
            }
        } catch (e) {
            throw new Error(
                `${e} in ${(configuration as any).name || 'unk'}.${new String(key)}`);
        }
    }

    // Don't perform post_validate step on overrides, as overrides
    // don't have the full set of properties.
    if (validatorSet.post_validate && !isOverride(configuration as unknown as ConfigurationItem)) {
        try {
            validatorSet.post_validate.call(configuration);
        } catch (e) {
            throw new Error(
                `${e} in ${(configuration as any).name || 'unk'}`);
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
                    (def) => this.processConfiguration(definitions, nodeMap, def));

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
                (def) => this.processConfiguration(definitions, nodeMap, def));
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
            handler(JSON.parse(contents) as ConfigurationItem);
        } else if (ext === '.yaml' || ext === '.yml') {
            yaml.loadAll(contents, handler as (doc: unknown) => void);
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
                data += chunk.toString();
            });

            process.stdin.on('end', () => {
                try {
                    if (/^\s*{/.exec(data)) {
                        // Appears to be JSON
                        handler(JSON.parse(data) as ConfigurationItem);
                    } else {
                        // Assume it's YAML
                        yaml.loadAll(data, handler as (doc: unknown) => void);
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
    private processConfiguration(definitions: IndexDefinition[], nodeMap: NodeMap, configuration: ConfigurationItem): void {
        let match: IndexDefinition | undefined;
        if (isOverride(configuration) || isIndex(configuration)) {
            match = definitions.find((p) => isSameIndex(p, configuration));
        }

        if (configuration.type === undefined) {
            configuration.type = ConfigurationType.Index;
        }

        this.validateConfiguration(configuration, match);

        if (isNodeMap(configuration)) {
            if (configuration.map && isObjectLike(configuration.map)) {
                nodeMap.merge(configuration.map);
            } else {
                throw new Error('Invalid nodeMap');
            }
        } else if (isOverride(configuration)) {
            // Override definition
            if (match) {
                match.applyOverride(configuration);
            } else {
                // Ignore overrides with no matching index
                this.logger.warn(
                    chalk.yellowBright(
                        `No index definition found '${configuration.name}'`));
            }
        } else if (isIndex(configuration)) {
            // Regular index definition

            if (match) {
                throw new Error(
                    `Duplicate index definition '${configuration.name}'`);
            }

            definitions.push(new IndexDefinition(configuration));
        } else {
            throw new Error(`Unknown definition type '${(configuration as any).type}'`);
        }
    }

    /**
     * Validates a definition based on its type, throwing an exception
     * if there is a problem.
     */
    private validateConfiguration(configuration: ConfigurationItem, match?: IndexDefinition) {
        let effectiveType = configuration.type;
        if (effectiveType === ConfigurationType.Override && match) {
            // Use validators based on the type of definition being overriden

            if (match instanceof IndexDefinition) {
                effectiveType = ConfigurationType.Index;
            }
        }

        switch (effectiveType) {
            case ConfigurationType.Index:
                validateConfiguration(IndexValidators, configuration as IndexConfigurationBase);
                break;

            case ConfigurationType.NodeMap:
                validateConfiguration(NodeMapValidators, configuration as NodeMapConfiguration);
                break;
        }
    }
}
