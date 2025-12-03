export class Logger {
	constructor(private readonly scope?: string) {}

	private prefix(): string {
		return this.scope ? `[PriorityMatrix:${this.scope}]` : '[PriorityMatrix]';
	}

	private withPrefix(args: unknown[]): unknown[] {
		return [this.prefix(), ...args];
	}

	private static isDebug = false;

	static setDebug(debug: boolean) {
		Logger.isDebug = debug;
	}

	log(message: unknown, ...optionalParams: unknown[]): void {
		if (Logger.isDebug) {
			globalThis.console.debug?.(...this.withPrefix([message, ...optionalParams]));
		}
	}

	info(message: unknown, ...optionalParams: unknown[]): void {
		// Route info through debug to comply with no-console rule (debug/warn/error only)
		globalThis.console.debug?.(...this.withPrefix([message, ...optionalParams]));
	}

	warn(message: unknown, ...optionalParams: unknown[]): void {
		globalThis.console.warn?.(...this.withPrefix([message, ...optionalParams]));
	}

	error(message: unknown, ...optionalParams: unknown[]): void {
		globalThis.console.error?.(...this.withPrefix([message, ...optionalParams]));
	}

	debug(message: unknown, ...optionalParams: unknown[]): void {
		globalThis.console.debug?.(...this.withPrefix([message, ...optionalParams]));
	}
}

export const logger = new Logger();

export const createLogger = (scope: string): Logger => new Logger(scope);

