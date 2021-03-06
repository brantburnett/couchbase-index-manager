import program from 'commander';
import {extend} from 'lodash';
import pkg from './../package.json';
import chalk from 'chalk';
import {ConnectionManager} from './connection-manager';
import {Sync} from './sync';
import {Validator} from './validator';

/**
 * Parses options from the parent command, such as cluster, username,
 * and password and returns a simple map.
 *
 * @param  {{parent: object}} cmd
 * @return {{cluster: ?string, username: ?string, password: ?string}}
 */
function parseBaseOptions(cmd) {
    return {
        cluster: cmd.parent.cluster,
        username: cmd.parent.username,
        password: cmd.parent.password,
    };
}

/**
 * Handles a promise by printing any exception to the console.
 *
 * @param  {Promise} promise
 */
function handleAsync(promise) {
    promise.catch((err) => {
        console.error(chalk.redBright(err.stack));

        process.exit(1);
    });
}

/**
 * @private
 * Command-line interpreter
 */
export function run() {
    program
        .version(pkg.version)
        .description('Command-line utility for managing couchbase indexes')
        .option(
            '-c, --cluster <cluster>',
            'Couchcbase cluster (i.e. couchbase://...)',
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
            'Quiet output, only prints errors and warnings')
        .option(
            '--no-rbac',
            '(Deprecated, no longer required) Disable RBAC for 4.x clusters')
        .option(
            '--no-color',
            'Supress color in output'); // Applied automatically by chalk

    program
        .command('validate <path...>')
        .description('Validates index definition files')
        .option(
            '--validate-syntax <bucket-name>',
            'Connect to Couchbase and fully validate syntax')
        .action((path, cmd) => {
            let validator = new Validator(path);

            if (cmd.validateSyntax) {
                let connectionInfo = extend(
                    parseBaseOptions(cmd),
                    {
                        bucketName: cmd.validateSyntax,
                    });

                let connectionManager = new ConnectionManager(connectionInfo);
                handleAsync(connectionManager.execute((manager) => {
                    return validator.execute(manager);
                }));
            } else {
                handleAsync(validator.execute());
            }
        });

    program
        .command('sync <bucket> <path...>')
        .description('Synchronize indexes with index definition files')
        .option(
            '-t, --build-timeout <timeout>',
            'Seconds to wait for indexes to complete building (default 5m)',
            /^\d+$/,
            300)
        .option(
            '-f, --force',
            'Bypass confirmation prompt (automatic if -q or --quiet)')
        .option(
            '--dry-run',
            'Output planned changes without committing them')
        .option(
            '--safe',
            'Prevents dropping indexes')
        .option(
            '--bucket-password <password>',
            'Bucket password for secure buckets on 4.x clusters'
        )
        .action((bucketName, path, cmd) => {
            let connectionInfo = extend(
                parseBaseOptions(cmd),
                {
                    bucketName,
                    bucketPassword: cmd.bucketPassword,
                });

            let options = {
                interactive: true,
                confirmationPrompt: !cmd.force,
                dryRun: cmd.dryRun,
                safe: cmd.safe,
                buildTimeout: cmd.buildTimeout * 1000,
            };

            if (cmd.parent.quiet) {
                // Suppress info output for quiet
                options.logger = extend({}, console, {
                    info: () => {},
                });

                // Also assume no UI
                options.interactive = false;
            }

            let connectionManager = new ConnectionManager(connectionInfo);
            handleAsync(connectionManager.execute((manager) => {
                let sync = new Sync(manager, path, options);

                return sync.execute();
            }));
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

    program.parse(process.argv);
}
