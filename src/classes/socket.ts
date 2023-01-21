import Emitter from "./emitter";
import {ReconnectPolicy, OnReconnectAttemptCb} from "../Types";

export const OPENED = Symbol("Opened");
export const CLOSED = Symbol("Closed");


export enum SocketState {
	NONE         = "NONE",

	OPENING      = "OPENING",

	OPENED       = "OPENED",

	CLOSED       = "CLOSED",

	RECONNECTING = "RECONNECTING",
}

async function createWebsocketClient(url: string): Promise<WebSocket> {
	if (typeof WebSocket !== "undefined") {
		return new WebSocket(url);
	}


	const result = await import("ws");

	return new result.default(url, {
		handshakeTimeout : 2000,
	}) as any as WebSocket;

}

export const defaultReconnectPolicy: ReconnectPolicy = {
	autoReconnect        : true,
	reconnectInterval    : 1000,
	maxReconnectAttempts : 10,
	maxReconnectInterval : 30000,
};

export default class Socket extends Emitter {
	ws!: WebSocket;

	url: string;

	state: SocketState = SocketState.NONE;

	public reconnectPolicy: ReconnectPolicy = defaultReconnectPolicy;

	reconnectState: {
		timeout: any,
		attempt: number,
		interval: number,
		lastAttemptAt: number,
	} = {
		timeout       : null,
		attempt       : 0,
		interval      : 0,
		lastAttemptAt : 0,
	};

	private resolver: {
		state: "pending" | "resolved" | "rejected",
		handled: boolean,
		resolve: (value: any) => void,
		reject: (e: Error) => void
	};

	private onReconnectAttemptCb: OnReconnectAttemptCb;

	constructor(
		url: URL | string,
		reconnectPolicy: ReconnectPolicy,
		onReconnectAttemptCb?: OnReconnectAttemptCb,
	) {
		super();

		this.onReconnectAttemptCb = onReconnectAttemptCb;
		this.reconnectPolicy      = reconnectPolicy || defaultReconnectPolicy;

		this.ensureCorrectUrl(url);
	}

	private ensureCorrectUrl(url: URL | string) {
		if (!url) {
			throw new Error("Url is empty or not passed");
		}

		if (typeof url !== "string") {
			url = url.toString();
		}

		// check if url has a valid protocol
		if (!/^https?:\/\//i.test(url)) {
			throw new Error("Invalid protocol, expected http or https");
		}

		url = url.replace("http://", "ws://").replace("https://", "wss://");

		// check if url already ends with '/rpc'
		if (!/\/rpc$/.test(url)) {
			// append '/rpc' to the end of the url
			url += "/rpc";
		}


		this.url = url;
	}

	private connectionFailed(e) {
		if (this.resolver?.handled) {
			return;
		}

		if (this.reconnectState.attempt > 0) {

			this.attemptReconnect();

			return;
		}

		this.resolver.handled = true;
		this.resolver.state   = "rejected";

		if (e instanceof Event) {
			this.resolver.reject(new Error("Connection failed"));
			return;
		}

		this.resolver.reject(e ? new Error(e?.message || e.toString()) : new Error("Connection failed"));
	}

	open() {
		return new Promise<any>(async (resolve, reject) => {

			this.resolver = {
				state   : "pending",
				handled : false,
				resolve,
				reject
			};

			this.ws = await createWebsocketClient(this.url);

			this.state = SocketState.OPENING;

			const stopRetry = () => {
				clearTimeout(this.reconnectState.timeout);

				// We stop retrying, so we'll fire the close event
				this.connectionFailed(new Error("Failed to reconnect"));

				this.ws.removeEventListener("error", this.connectionFailed.bind(this));
				this.ws.removeEventListener("close", this.connectionFailed.bind(this));
			};

			if (this.reconnectState.attempt > 0) {
				this.reconnectState.interval = Math.min(
					this.reconnectState.interval * 2,
					this.reconnectPolicy.maxReconnectInterval
				);

				if (this.reconnectState.attempt > this.reconnectPolicy.maxReconnectAttempts) {
					stopRetry();
					return;
				}
			}

			if (this.onReconnectAttemptCb) {
				if (this.onReconnectAttemptCb(this.reconnectState.attempt) === false) {
					stopRetry();
					return;
				}
			}


			// Setup initial error/close handlers for the connection stage
			this.ws.addEventListener("error", this.connectionFailed.bind(this));
			this.ws.addEventListener("close", this.connectionFailed.bind(this));

			this.ws.addEventListener("message", (e) => this.emit("message", e));

			this.ws.addEventListener("open", (e) => {
				this.state = SocketState.OPENED;

				if (this.reconnectState?.attempt > 0) {
					this.emit("reconnected", this.reconnectState.attempt);
				}

				this.reconnectState = {
					timeout       : null,
					attempt       : 0,
					interval      : this.reconnectPolicy.reconnectInterval,
					lastAttemptAt : 0,
				};

				// If we successfully connect, remove those initial handlers
				this.ws.removeEventListener("error", this.connectionFailed.bind(this));
				this.ws.removeEventListener("close", this.connectionFailed.bind(this));

				// Set up new handlers for the end user
				this.ws.addEventListener("error", (e) => this.emit("error", e));
				this.ws.addEventListener("close", (e) => {
					this.state = SocketState.CLOSED;

					if (!this.reconnectPolicy.autoReconnect) {
						// We stop retrying, so we'll fire the close event
						this.emit("close", e);
						return;
					}

					if (this.reconnectState.attempt === 0) {
						this.emit("onLostConnection", e);
					}

					this.attemptReconnect();

				});

				this.emit("open", e);

				this.resolver.resolve(this);
			});
		});
	}

	send(data: string): void {
		this.ws.send(data);
	}

	close(code = 1000, reason = "Some reason"): void {
		this.state = SocketState.CLOSED;

		this.ws.close(code, reason);
	}

	public isClosed() {
		return this.state === SocketState.CLOSED;
	}

	public isConnecting() {
		return this.state === SocketState.OPENING;
	}

	public isOpen() {
		return this.state === SocketState.OPENED;
	}

	public isReconnecting() {
		return this.state === SocketState.RECONNECTING;
	}

	public isConnected(): boolean {
		return this.isOpen();
	}

	private attemptReconnect(): void {
		clearTimeout(this.reconnectState.timeout);

		this.reconnectState.timeout = setTimeout(async () => {

//			console.log("Attempting to reconnect");
//			console.log("Last tried: ", Date.now() - this.reconnectState.lastAttemptAt);

			this.reconnectState.attempt++;
			this.reconnectState.lastAttemptAt = Date.now();

			try {
				await this.open();
			} catch (e) {
				console.error("recon", e);
			}
		}, this.reconnectState.interval);
	}
}
