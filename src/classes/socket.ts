import Emitter from "./emitter";

export const OPENED = Symbol("Opened");
export const CLOSED = Symbol("Closed");


async function createWebsocketClient(url: string): Promise<WebSocket> {
	if (typeof WebSocket !== "undefined") {
		return new WebSocket(url);
	}


	const result = await import("ws");

	return new result.default(url, {
		handshakeTimeout : 2000,
	}) as any as WebSocket;

}

export default class Socket extends Emitter {
	ws!: WebSocket;

	url: string;

	closed = false;

	status = CLOSED;

	private resolver: {
		state: "pending" | "resolved" | "rejected",
		handled: boolean,
		resolve: (value: any) => void,
		reject: (e: Error) => void
	};

	constructor(url: URL | string) {
		super();

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
		this.resolver.handled = true;
		this.resolver.state   = "rejected";

		if(e instanceof Event) {
			this.resolver.reject(new Error('Connection failed'));
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

			if (this.ws) {
				this.ws.close();
				this.ws = null;
			}

			this.ws = await createWebsocketClient(this.url);

			// Setup initial error/close handlers for the connection stage
			this.ws.addEventListener("error", this.connectionFailed.bind(this));
			this.ws.addEventListener("close", this.connectionFailed.bind(this));

			this.ws.addEventListener("message", (e) => this.emit("message", e));

			this.ws.addEventListener("open", (e) => {
				this.status = OPENED;

				// If we successfully connect, remove those initial handlers
				this.ws.removeEventListener("error", this.connectionFailed.bind(this));
				this.ws.removeEventListener("close", this.connectionFailed.bind(this));

				// Set up new handlers for the end user
				this.ws.addEventListener("error", (e) => this.emit("error", e));
				this.ws.addEventListener("close", (e) => {
					this.emit("close", e);

//					if (this.status === OPENED) {
//						this.#init();
//					}

					this.status = CLOSED;

					if (this.closed === false) {
						setTimeout(() => {
							this.open();
						}, 2500);
					}
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
		this.closed = true;
		this.ws.close(code, reason);
	}

	public isConnected(): boolean {
		if (this.status === CLOSED) {
			return false;
		}

		return this.closed === false;
	}
}
