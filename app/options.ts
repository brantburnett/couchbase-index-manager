export interface Options {
    interactive: boolean;
    confirmationPrompt: boolean;
    dryRun: boolean;
    safe: boolean;
    buildTimeout: number;
    logger?: Logger;
}

export interface Logger {
    log(message?: any, ...optionalParams: any[]): void;
    info(message?: any, ...optionalParams: any[]): void;
    warn(message?: any, ...optionalParams: any[]): void;
    error(message?: any, ...optionalParams: any[]): void;
    debug(message?: any, ...optionalParams: any[]): void;
}
