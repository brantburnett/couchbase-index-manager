
/**
 * Callback which returns true if the sync should continue.
 */
export type ConfirmSyncCallback = (prompt: string) => Promise<boolean>;

export interface SyncOptions {
    interactive: boolean;
    confirmSync: ConfirmSyncCallback;
    dryRun: boolean;
    safe: boolean;
    buildTimeout: number;
    logger?: Logger;
}

export interface ValidateOptions {
    logger?: Logger;
}

export interface Logger {
    log(message?: any, ...optionalParams: any[]): void;
    info(message?: any, ...optionalParams: any[]): void;
    warn(message?: any, ...optionalParams: any[]): void;
    error(message?: any, ...optionalParams: any[]): void;
    debug(message?: any, ...optionalParams: any[]): void;
}
