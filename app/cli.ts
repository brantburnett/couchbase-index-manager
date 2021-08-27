import { Command, program } from 'commander';
import chalk from 'chalk';
import { ConnectionInfo, ConnectionManager } from './connection-manager';
import { Sync } from './sync';
import { Validator } from './validator';
import { Options } from './options';

// We use require since this file is above our TS base path
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('./../package.json');

import 'source-map-support/register';

function parseBaseOptions(cmd: Command): { cluster: string, username: string, password: string} {
    return {
        cluster: cmd.getOptionValue('cluster'),
        username: cmd.getOptionValue('username'),
        password: cmd.getOptionValue('password'),
    };
}

function handleAsync(promise: Promise<any>): void {
    promise.catch((err) => {
        console.error(chalk.redBright(err.stack));

        process.exit(1);
    });
}

export function run(): void {
    program
        .version(pkg.version)
        .description('Command-line utility for managing couchbase indexes')
        .option(
            '-c, --cluster <cluster>',
            'Couchbase cluster (i.e. couchbase://...)',
            'couchbase://localhost')
        .option(
            '-u, --username <username>',
            'Couchbase administrator username',
            'Administrator')
        .option(
            '-p, --password <password>',
            'Couchbase administrator password')
        .option(
            '-q, --quiet',
            'Quiet output, only prints errors and warnings',
            false)
        .option(
            '--no-color',
            'Supress color in output',
            false); // Applied automatically by chalk

    const validateCommand = program
        .command('validate <path...>')
        .description('Validates index definition files')
        .option(
            '--validate-syntax <bucket-name>',
            'Connect to Couchbase and fully validate syntax')
        .action(async (path: string, cmd: { validateSyntax?: string }) => {
            const validator = new Validator(path);

            const bucketName = cmd.validateSyntax as string;
            if (bucketName) {
                const connectionInfo: ConnectionInfo = {
                    ...parseBaseOptions(validateCommand.parent),
                    bucketName: bucketName,
                };

                const connectionManager = new ConnectionManager(connectionInfo);
                await connectionManager.execute((manager) => {
                    return validator.execute(manager);
                });
            } else {
                await validator.execute();
            }
        });

    const syncCommand = program
        .command('sync <bucket> <path...>')
        .description('Synchronize indexes with index definition files')
        .option(
            '-t, --build-timeout <timeout>',
            'Seconds to wait for indexes to complete building (default 5m)',
            /^\d+$/,
            '300')
        .option(
            '-f, --force',
            'Bypass confirmation prompt (automatic if -q or --quiet)',
            false)
        .option(
            '--dry-run',
            'Output planned changes without committing them',
            false)
        .option(
            '--safe',
            'Prevents dropping indexes',
            false)
        .option(
            '--bucket-password <password>',
            'Bucket password for secure buckets on 4.x clusters'
        )
        .action(async (bucketName: string, path: string, cmd: { buildTimeout: string, force: boolean, dryRun: boolean, safe: boolean }) => {
            const connectionInfo: ConnectionInfo = {
                ...parseBaseOptions(syncCommand.parent),
                bucketName,
            };

            const options: Options = {
                interactive: true,
                confirmationPrompt: !cmd.force,
                dryRun: cmd.dryRun,
                safe: cmd.safe,
                buildTimeout: parseInt(cmd.buildTimeout, 10) * 1000,
            };

            if (syncCommand.parent.getOptionValue('quiet')) {
                options.logger = {
                    ...console,
                    info: () => { /* Suppress info output for quiet */ },
                };

                // Also assume no UI
                options.interactive = false;
            }

            const connectionManager = new ConnectionManager(connectionInfo);
            await connectionManager.execute((manager) => {
                const sync = new Sync(manager, path, options);

                return sync.execute();
            });
        })
        .on('--help', () => {
            console.log();
            console.log('  Examples:');
            console.log();
            // eslint-disable-next-line max-len
            console.log('    $ couchbase-index-manager -c couchbase://localhost -u Administrator -p password sync beer-sample ./directory/');
            // eslint-disable-next-line max-len
            console.log('    $ couchbase-index-manager -c couchbase://localhost -u Administrator -p password sync beer-sample ./directory/file.yaml');
            // eslint-disable-next-line max-len
            console.log('    $ couchbase-index-manager -c couchbase://localhost -u Administrator -p password sync beer-sample ./directory/file.json');
        });

    handleAsync(program.parseAsync(process.argv));
}
