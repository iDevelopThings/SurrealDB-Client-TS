export default class Pinger {
	pinger?: any;

	interval: number;

	running: boolean = false;

	constructor(interval = 30000) {
		this.interval = interval;
	}

	start(func: () => void, ...args: unknown[]): void {
		if (this.running) return;

		this.running = true;
		this.pinger  = setInterval(func, this.interval, ...args);
	}

	isRunning(): boolean {
		return this.running;
	};

	stop(): void {
		if (!this.running) return;

		this.running = false;
		clearInterval(this.pinger);
	}
}
