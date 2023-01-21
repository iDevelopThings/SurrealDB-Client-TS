interface BasePatch {
	path: string;
}

export interface AddPatch extends BasePatch {
	op: "add";
	value: any;
}

export interface RemovePatch extends BasePatch {
	op: "remove";
}

export interface ReplacePatch extends BasePatch {
	op: "replace";
	value: any;
}

export interface ChangePatch extends BasePatch {
	op: "change";
	value: string;
}

export type Patch =
	| AddPatch
	| RemovePatch
	| ReplacePatch
	| ChangePatch;

export interface ResultOk<T> {
	result: T;
	error?: never;
}

export interface ResultErr {
	result?: never;
	error: Error;
}

export type Result<T = unknown> = ResultOk<T> | ResultErr;

export interface RootAuth {
	user: string;
	pass: string;
}

export interface NamespaceAuth {
	NS: string;
	user: string;
	pass: string;
}

export interface DatabaseAuth {
	NS: string;
	DB: string;
	user: string;
	pass: string;
}

export interface ScopeAuth {
	NS: string;
	DB: string;
	SC: string;
	[key: string]: unknown;
}

export type Auth =
	| RootAuth
	| NamespaceAuth
	| DatabaseAuth
	| ScopeAuth;


export interface ClientConfiguration {
	host: string | URL;

	auth: Auth;

	use: UseConfig;
}

export interface ReconnectPolicy {
	autoReconnect: boolean;

	maxReconnectAttempts?: number;

	reconnectInterval?: number;

	maxReconnectInterval?: number;
}

export type UseConfig = {
	ns: string;
	db: string;
}


export type ClientEvents = {
	"close": OnConnectionEndCb,
	"open": OnConnectionOpenCb,
	"lostConnection": OnLostConnectionCb,
	"reconnectAttempt": OnReconnectAttemptCb,
	"reconnected": OnReconnectedCb,
	"connectionFailure": OnConnectionFailureCb,
}

/**
 * Callback definitions
 */

export type OnConnectionEndCb = () => void;
export type OnConnectionFailureCb = (error: Error) => void;
export type OnConnectionOpenCb = () => void;

export type OnLostConnectionCb = () => void;
export type OnReconnectAttemptCb = (attempts: number) => boolean;
export type OnReconnectedCb = (attempts: number) => void;
