import Emitter from "./emitter";

export const OPENED = Symbol("Opened");
export const CLOSED = Symbol("Closed");

export default class Socket extends Emitter {
	ws!: WebSocket;

	url: string;

	closed = false;

	status = CLOSED;

	constructor(url: URL | string) {
		super();

		this.#init();

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

	ready!: Promise<void>;
	private resolve!: () => void;

	#init(): void {
		this.ready = new Promise((resolve) => {
			this.resolve = resolve;
		});
	}

	open(): void {
		this.ws = new WebSocket(this.url);

		// Setup event listeners so that the
		// Surreal instance can listen to the
		// necessary event types.

		this.ws.addEventListener("message", (e) => {
			this.emit("message", e);
		});

		this.ws.addEventListener("error", (e) => {
			this.emit("error", e);
		});

		this.ws.addEventListener("close", (e) => {
			this.emit("close", e);
		});

		this.ws.addEventListener("open", (e) => {
			this.emit("open", e);
		});

		// If the WebSocket connection with the
		// database was disconnected, then we need
		// to reset the ready promise.

		this.ws.addEventListener("close", () => {
			if (this.status === OPENED) {
				this.#init();
			}
		});

		// When the WebSocket is opened or closed
		// then we need to store the connection
		// status within the status property.

		this.ws.addEventListener("close", () => {
			this.status = CLOSED;
		});

		this.ws.addEventListener("open", () => {
			this.status = OPENED;
		});

		// If the connection is closed, then we
		// need to attempt to reconnect on a
		// regular basis until we are successful.

		this.ws.addEventListener("close", () => {
			if (this.closed === false) {
				setTimeout(() => {
					this.open();
				}, 2500);
			}
		});

		// When the WebSocket successfully opens
		// then let's resolve the ready promise so
		// that promise based code can continue.

		this.ws.addEventListener("open", () => {
			this.resolve();
		});
	}

	send(data: string): void {
		this.ws.send(data);
	}

	close(code = 1000, reason = "Some reason"): void {
		this.closed = true;
		this.ws.close(code, reason);
	}
}
