export class Logger {
	constructor(private readonly scope?: string) {}

	private prefix(): string {
		return this.scope ? `[PriorityMatrix:${this.scope}]` : '[PriorityMatrix]';
	}

	private withPrefix(args: unknown[]): unknown[] {
		return [this.prefix(), ...args];
	}

	log(message: unknown, ...optionalParams: unknown[]): void {
		console.log(...this.withPrefix([message, ...optionalParams]));
	}

	info(message: unknown, ...optionalParams: unknown[]): void {
		console.info(...this.withPrefix([message, ...optionalParams]));
	}

	warn(message: unknown, ...optionalParams: unknown[]): void {
		console.warn(...this.withPrefix([message, ...optionalParams]));
	}

	error(message: unknown, ...optionalParams: unknown[]): void {
		console.error(...this.withPrefix([message, ...optionalParams]));
	}

	debug(message: unknown, ...optionalParams: unknown[]): void {
		console.debug(...this.withPrefix([message, ...optionalParams]));
	}
}

export const logger = new Logger();

export const createLogger = (scope: string): Logger => new Logger(scope);

