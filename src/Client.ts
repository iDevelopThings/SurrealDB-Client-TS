import Emitter from "./classes/emitter";
import {AuthenticationError, PermissionError, RecordError} from "./errors";
import Socket from "./classes/socket";
import Pinger from "./classes/pinger";
import guid from "./utils/guid";
import Live from "./classes/live";
import type {Auth, Result, Patch, OnConnectionEndCb, ClientEvents, OnConnectionOpenCb, UseConfig, OnConnectionFailureCb, OnLostConnectionCb, OnReconnectAttemptCb, OnReconnectedCb} from "./Types";
import {ClientConfiguration, ReconnectPolicy} from "./Types";
import {SigninResult} from "./result/SigninResult";
import {ConnectionFlowResult, ConnectionFlowStage} from "./result/ConnectionFlowResult";
import {BaseResult} from "./result/BaseResult";
import {UseResult} from "./result/UseResult";

let singleton: Client;



export class Client extends Emitter {
	// ------------------------------
	// Main singleton
	// ------------------------------

	/**
	 * The Instance static singleton ensures that a single database instance is available across very large or complicated applications.
	 * With the singleton, only one connection to the database is instantiated, and the database connection does not have to be shared
	 * across components or controllers.
	 * @return A Surreal instance.
	 */
	static get Instance(): Client {
		return singleton ? singleton : singleton = new Client();
	}

	// ------------------------------
	// Public types
	// ------------------------------
	static get Live(): typeof Live {
		return Live;
	}

	// ------------------------------
	// Properties
	// ------------------------------

	private events: ClientEvents = {
		"close"             : null,
		"open"              : null,
		"connectionFailure" : null,
		"lostConnection"    : null,
		"reconnectAttempt"  : null,
		"reconnected"       : null,
	};

	public reconnectPolicy: ReconnectPolicy;

	public configuration: ClientConfiguration;

	ws!: Socket;

	url?: string;

	token?: string;

	pinger!: Pinger;

//	attempted?: Promise<void>;

	// ------------------------------
	// Accessors
	// ------------------------------

	getToken(): string | undefined {
		return this.token;
	}

	setToken(token) {
		this.token = token;
	}

	// ------------------------------
	// Methods
	// ------------------------------

	public setReconnectPolicy(config: ReconnectPolicy) {
		this.reconnectPolicy = config;
	}

	public configure(config: ClientConfiguration) {
		this.configuration = config;
	}

	public isConfigured(checkFullConfiguration: boolean = false) {
		if (!this.configuration) {
			return false;
		}

		if (!this.configuration.host) return false;

		if (checkFullConfiguration) {
			if (!this.configuration.auth) return false;
			if (!this.configuration.use) return false;
		}

		return true;
	}

	onConnectionEnd(cb: OnConnectionEndCb) {
		this.events.close = cb;
	}

	onConnectionOpen(cb: OnConnectionOpenCb) {
		this.events.open = cb;
	}

	onConnectionFailure(cb: OnConnectionFailureCb) {
		this.events.connectionFailure = cb;
	}

	onLostConnection(cb: OnLostConnectionCb) {
		this.events.lostConnection = cb;
	}

	onReconnectAttempt(cb: OnReconnectAttemptCb) {
		this.events.reconnectAttempt = cb;
	}

	onReconnected(cb: OnReconnectedCb) {
		this.events.reconnected = cb;
	}

	private callCb<T extends keyof ClientEvents>(type: T, args?: Parameters<ClientEvents[T]>) {
		if (this.events[type]) {
			//@ts-ignore
			this.events[type](...(args || []));
		}
	}

	/**
	 * Connects to a local or remote database endpoint.
	 */
	async connect(): Promise<void> {
		if (!this.isConfigured()) {
			throw new Error("Client is not configured. Call .configure({...}) with your database configuration.");
		}

		try {
			// Next we setup the websocket connection
			// and listen for events on the socket,
			// specifying whether logging is enabled.

			this.ws = new Socket(this.configuration.host, this.reconnectPolicy, this.events.reconnectAttempt);

			// Setup the interval pinger so that the
			// connection is kept alive through
			// loadbalancers and proxies.

			this.pinger = new Pinger(30000);

			// When the connection is opened we
			// change the relevant properties
			// open live queries, and trigger.

			this.ws.on("open", () => {
				this.callCb("open");
				this.pinger.start(() => {
					this.ping();
				});
			});

			this.ws.on("onLostConnection", () => {
				this.callCb("lostConnection");
			});

			this.ws.on("reconnected", (attempts) => {
				this.callCb("reconnected", [attempts]);
			});

			// When the connection is closed we
			// change the relevant properties
			// stop live queries, and trigger.

			this.ws.on("close", () => {
				this.callCb("close");
				this.pinger.stop();
			});

			// When we receive a socket message
			// we process it. If it has an ID
			// then it is a query response.

			this.ws.on("message", (e: { data: string }) => {
				const d = JSON.parse(e.data);

				if (d.method !== "notify") {
					return this.emit(d.id, d);
				}

				if (d.method === "notify") {
					return d.params.forEach((r: undefined) => {
						this.emit("notify", r);
					});
				}
			});

			// Open the websocket for the first
			// time. This will automatically
			// attempt to reconnect on failure.

			await this.ws.open();
		} catch (e) {
			this.callCb("connectionFailure", [e]);

			return Promise.reject(e);
		}
	}

	// --------------------------------------------------
	// Public methods
	// --------------------------------------------------

	async startConnectionFlow(): Promise<ConnectionFlowResult> {
		if (!this.isConfigured(true)) {
			throw new Error("Client is not configured. Call .configure({...}) with your database configuration.");
		}

		const result = new ConnectionFlowResult();

		const onFailure = (data: Error | BaseResult) => {
			let returnDidFail: boolean = false;
			if (data instanceof Error) {
				result.setError(data);
				returnDidFail = true;
			}

			if (data instanceof BaseResult && !returnDidFail) {
				returnDidFail = data.didFail();
			}

			if (returnDidFail) {
				if (this.isConnected()) {
					this.close();
				}
			}

			return returnDidFail;
		};

		try {
			result.currentStage = ConnectionFlowStage.Connect;

			if (!this.isConnected()) {
				await this.connect();
			}
		} catch (error) {
			onFailure(error);
			return result;
		}

		try {
			result.currentStage = ConnectionFlowStage.Signin;

			const authResult = await this.signin();
			result.setAuthResult(authResult);

			if (onFailure(authResult)) {
				return result;
			}
		} catch (error) {
			onFailure(error);
			return result;
		}

		try {
			result.currentStage = ConnectionFlowStage.Use;

			const useResult = await this.use();
			result.setUseResult(useResult);


			if (onFailure(useResult)) {
				return result;
			}
		} catch (error) {
			onFailure(error);
			return result;
		}

		return result;
	}

	sync(query: string, vars?: Record<string, unknown>): Live {
		return new Live(this, query, vars);
	}

	/**
	 * Closes the persistent connection to the database.
	 */
	close(): void {
		this.ws.close();
	}

	// --------------------------------------------------

	/**
	 * Ping SurrealDB instance
	 */
	ping(): Promise<void> {
		const id = guid();
		return new Promise(() => {
			this.sendEvent(id, "ping");
		});
	}

	/**
	 * Switch to a specific namespace and database.
	 */
	use(useConfig?: UseConfig): Promise<UseResult> {
		const id = guid();
		if (!useConfig) {
			if (!this.configuration?.use) {
				throw new Error("No use configuration provided and no use configuration found in client configuration.");
			}

			useConfig = this.configuration.use;
		}

		return new Promise((resolve, reject) => {
			this.once(id, (res) => this.#use(res, resolve, reject));
			this.sendEvent(id, "use", [useConfig.ns, useConfig.db]);
		});
	}

	/**
	 * Retreive info about the current Surreal instance
	 * @return Returns nothing!
	 */
	info(): Promise<void> {
		const id = guid();
		return new Promise((resolve, reject) => {
			this.once(id, (res) => this.#result(res, resolve, reject));
			this.sendEvent(id, "info");
		});
	}

	/**
	 * Signs up to a specific authentication scope.
	 * @param vars - Variables used in a signup query.
	 * @return The authenication token.
	 */
	signup(vars: Auth): Promise<string> {
		const id = guid();
		return new Promise((resolve, reject) => {
			this.once(id, (res) => this.#signup(res, resolve, reject));
			this.sendEvent(id, "signup", [vars]);
		});
	}

	/**
	 * Signs in to a specific authentication scope.
	 * @param authVars - Variables used in a signin query.
	 * @return The authentication token.
	 */
	signin(authVars?: Auth): Promise<SigninResult> {
		const id = guid();

		if (!authVars) {
			if (!this.configuration?.auth) {
				throw new Error("No auth variables provided and no auth variables configured. Please provide auth variables or configure the client with auth variables.");
			}

			authVars = this.configuration.auth;
		}

		return new Promise((resolve, reject) => {
			this.once(id, (res) => this.#signin(res, resolve, reject));
			this.sendEvent(id, "signin", [authVars]);
		});
	}

	/**
	 * Invalidates the authentication for the current connection.
	 */
	invalidate(): Promise<void> {
		const id = guid();
		return new Promise((resolve, reject) => {
			this.once(id, (res) => this.#auth(res, resolve, reject));
			this.sendEvent(id, "invalidate");
		});
	}

	/**
	 * Authenticates the current connection with a JWT token.
	 * @param token - The JWT authentication token.
	 */
	authenticate(token: string): Promise<void> {
		const id = guid();
		return new Promise<unknown>((resolve, reject) => {
			this.once(id, (res) => this.#auth(res, resolve, reject));
			this.sendEvent(id, "authenticate", [token]);
		}) as Promise<void>;
	}

	// --------------------------------------------------

	live(table: string): Promise<string> {
		const id = guid();
		return new Promise((resolve, reject) => {
			this.once(id, (res) => this.#result(res, resolve, reject));
			this.sendEvent(id, "live", [table]);
		});
	}

	/**
	 * Kill a specific query.
	 * @param query - The query to kill.
	 */
	kill(query: string): Promise<void> {
		const id = guid();
		return new Promise((resolve, reject) => {
			this.once(id, (res) => this.#result(res, resolve, reject));
			this.sendEvent(id, "kill", [query]);
		});
	}

	/**
	 * Switch to a specific namespace and database.
	 * @param key - Specifies the name of the variable.
	 * @param val - Assigns the value to the variable name.
	 */
	let(key: string, val: unknown): Promise<string> {
		const id = guid();
		return new Promise((resolve, reject) => {
			this.once(id, (res) => this.#result(res, resolve, reject));
			this.sendEvent(id, "let", [key, val]);
		});
	}

	/**
	 * Runs a set of SurrealQL statements against the database.
	 * @param query - Specifies the SurrealQL statements.
	 * @param vars - Assigns variables which can be used in the query.
	 */
	query<T = Result[]>(
		query: string,
		vars?: Record<string, unknown>,
	): Promise<T> {
		const id = guid();
		return new Promise<T>((resolve, reject) => {
			this.once(
				id,
				(res) => this.#result(res, resolve as () => void, reject),
			);
			this.sendEvent(id, "query", [query, vars]);
		});
	}

	/**
	 * Selects all records in a table, or a specific record, from the database.
	 * @param thing - The table name or a record ID to select.
	 */
	select<T>(thing: string): Promise<T[]> {
		const id = guid();
		return new Promise((resolve, reject) => {
			this.once(
				id,
				(res) =>
					this.#output(res, "select", thing, resolve, reject),
			);
			this.sendEvent(id, "select", [thing]);
		});
	}

	/**
	 * Creates a record in the database.
	 * @param thing - The table name or the specific record ID to create.
	 * @param data - The document / record data to insert.
	 */
	create<T extends Record<string, unknown>>(
		thing: string,
		data?: T,
	): Promise<T & { id: string }> {
		const id = guid();
		return new Promise((resolve, reject) => {
			this.once(
				id,
				(res) =>
					this.#output(res, "create", thing, resolve, reject),
			);
			this.sendEvent(id, "create", [thing, data]);
		});
	}

	/**
	 * Updates all records in a table, or a specific record, in the database.
	 *
	 * ***NOTE: This function replaces the current document / record data with the specified data.***
	 * @param thing - The table name or the specific record ID to update.
	 * @param data - The document / record data to insert.
	 */
	update<T extends Record<string, unknown>>(
		thing: string,
		data?: T,
	): Promise<T & { id: string }> {
		const id = guid();
		return new Promise((resolve, reject) => {
			this.once(
				id,
				(res) =>
					this.#output(res, "update", thing, resolve, reject),
			);
			this.sendEvent(id, "update", [thing, data]);
		});
	}

	/**
	 * Modifies all records in a table, or a specific record, in the database.
	 *
	 * ***NOTE: This function merges the current document / record data with the specified data.***
	 * @param thing - The table name or the specific record ID to change.
	 * @param data - The document / record data to insert.
	 */
	change<
		T extends Record<string, unknown>,
		U extends Record<string, unknown> = T,
	>(
		thing: string,
		data?: Partial<T> & U,
	): Promise<(T & U & { id: string }) | (T & U & { id: string })[]> {
		const id = guid();
		return new Promise((resolve, reject) => {
			this.once(
				id,
				(res) =>
					this.#output(res, "change", thing, resolve, reject),
			);
			this.sendEvent(id, "change", [thing, data]);
		});
	}

	/**
	 * Applies JSON Patch changes to all records, or a specific record, in the database.
	 *
	 * ***NOTE: This function patches the current document / record data with the specified JSON Patch data.***
	 * @param thing - The table name or the specific record ID to modify.
	 * @param data - The JSON Patch data with which to modify the records.
	 */
	modify(thing: string, data?: Patch[]): Promise<Patch[]> {
		const id = guid();
		return new Promise((resolve, reject) => {
			this.once(
				id,
				(res) =>
					this.#output(res, "modify", thing, resolve, reject),
			);
			this.sendEvent(id, "modify", [thing, data]);
		});
	}

	/**
	 * Deletes all records in a table, or a specific record, from the database.
	 * @param thing - The table name or a record ID to select.
	 */
	delete(thing: string): Promise<void> {
		const id = guid();
		return new Promise((resolve, reject) => {
			this.once(
				id,
				(res) =>
					this.#output(res, "delete", thing, resolve, reject),
			);
			this.sendEvent(id, "delete", [thing]);
		});
	}

	public isConnected(): boolean {
		if (!this.ws) return false;

		return this.ws.isConnected();
	}

	// --------------------------------------------------
	// Private methods
	// --------------------------------------------------

	/*#init(): void {
		this.attempted = new Promise((res) => {
			this.token
				? this.authenticate(this.token).then(res).catch(res)
				: res();
		});
	}*/

	sendEvent(id: string, method: string, params: unknown[] = []): void {
		this.ws.send(JSON.stringify({
			id     : id,
			method : method,
			params : params,
		}));
	}

	#auth<T>(
		res: Result<T>,
		resolve: (value: T) => void,
		reject: (reason?: any) => void,
	): void {
		if (res.error) {
			return reject(new AuthenticationError(res.error.message));
		} else {
			return resolve(res.result);
		}
	}

	#signin(
		res: Result<string>,
		resolve: (value: SigninResult) => void,
		reject: (reason?: any) => void,
	): void {
		if (res.error) {
			return resolve(SigninResult.failed(res.error.message));
		} else {
			this.token = res.result;
			return resolve(SigninResult.successful(res.result));
		}
	}

	#use(
		res: Result<any>,
		resolve: (value: UseResult) => void,
		reject: (reason?: any) => void,
	): void {
		if (res.error) {
			return resolve(UseResult.failed(res.error.message));
		} else {
			return resolve(UseResult.successful(res.result));
		}
	}

	#signup(
		res: Result<string>,
		resolve: (value: string) => void,
		reject: (reason?: any) => void,
	): void {
		if (res.error) {
			return reject(new AuthenticationError(res.error.message));
		} else if (res.result) {
			this.token = res.result;
			return resolve(res.result);
		}
	}

	#result<T>(
		res: Result<T>,
		resolve: (value: T) => void,
		reject: (reason?: any) => void,
	): void {
		if (res.error) {
			return reject(new Error(res.error.message));
		} else if (res.result) {
			return resolve(res.result);
		}
		return resolve(undefined as unknown as T);
	}

	#output<T>(
		res: Result<T>,
		type: string,
		id: string,
		resolve: (value: T) => void,
		reject: (reason?: any) => void,
	): void {
		if (res.error) {
			return reject(new Error(res.error.message));
		} else if (res.result) {
			switch (type) {
				case "delete":
					return resolve(undefined as unknown as T);
				case "create":
					return Array.isArray(res.result) && res.result.length
						? resolve(res.result[0])
						: reject(
							new PermissionError(
								`Unable to create record: ${id}`,
							),
						);
				case "update":
					if (typeof id === "string" && id.includes(":")) {
						return Array.isArray(res.result) && res.result.length
							? resolve(res.result[0])
							: reject(
								new PermissionError(
									`Unable to update record: ${id}`,
								),
							);
					} else {
						return resolve(res.result);
					}
				case "change":
					if (typeof id === "string" && id.includes(":")) {
						return Array.isArray(res.result) && res.result.length
							? resolve(res.result[0])
							: reject(
								new PermissionError(
									`Unable to update record: ${id}`,
								),
							);
					} else {
						return resolve(res.result);
					}
				case "modify":
					if (typeof id === "string" && id.includes(":")) {
						return Array.isArray(res.result) && res.result.length
							? resolve(res.result[0])
							: reject(
								new PermissionError(
									`Unable to update record: ${id}`,
								),
							);
					} else {
						return resolve(res.result);
					}
				default:
					if (typeof id === "string" && id.includes(":")) {
						return Array.isArray(res.result) && res.result.length
							? resolve(res.result)
							: reject(
								new RecordError(
									`Record not found: ${id}`,
								),
							);
					} else {
						return resolve(res.result);
					}
			}
		}
		return resolve(undefined as unknown as T);
	}
}
