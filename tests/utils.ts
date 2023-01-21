import {exec, type ChildProcess, spawn} from "child_process";
import {vi, expect} from "vitest";
import {Client} from "../src/Client";
import {OnConnectionEndCb, OnConnectionOpenCb, Auth, ClientConfiguration} from "../src/Types";
import {SigninResult} from "../src/result/SigninResult";


let serverProc: ChildProcess = null;

export interface ServerProcessInstance {
	serverProc: ChildProcess;
	start: () => void;
	stop: () => void;
	getStdout: () => string;
	getStderr: () => string;
}

export function createServerProcess(): ServerProcessInstance {

	const command = "/Users/sam/.surrealdb/surreal";
	const args    = ["start", "--log", "trace", "--user", "root", "--pass", "secret", "--bind", "127.0.0.1:4269"];

	let stdOut = "";
	let stdErr = "";

	function onNodeExit() {
		if (serverProc)
			serverProc.kill();
	}

	function onServerExit(code) {
		console.log(`child process exited with code ${code}`);
		serverProc = null;

		process.off("SIGINT", onNodeExit);
	}

	function start() {
		if (serverProc) {
			return;
		}

		serverProc = spawn(command, args);

		serverProc.stdout.on("data", (data) => {
			console.log(`stdout: ${data}`);

			stdOut += data;
		});

		serverProc.stderr.on("data", (data) => {
			console.error(`stderr: ${data}`);
			stdErr += data;
		});

		serverProc.on("close", onServerExit);

		process.on("SIGINT", onNodeExit);
	}

	function stop() {
		if (!serverProc) {
			return;
		}

		serverProc.kill();
	}

	return {
		serverProc,
		start,
		stop,

		getStdout : () => {
			return stdOut;
		},

		getStderr : () => {
			return stdErr;
		}
	};

}

export type Options = {
	user?: string;
	pass?: string;

	serverProcess?: ServerProcessInstance

	runSignin?: boolean
	signin?: Auth

	runUse?: boolean
	use?: [string, string]

	onConnectionEnd?: OnConnectionEndCb
	onConnectionOpen?: OnConnectionOpenCb
}

export async function createClient(options: Options) {

	if (!options?.serverProcess) {
		options.serverProcess = createServerProcess();
		options.serverProcess.start();
	}

	if (options?.runSignin === undefined) {
		options.runSignin = true;
	}

	if (options?.runUse === undefined) {
		options.runUse = true;
	}

	if (options?.use) {
		options.use = ["test", "test"];
	}

	const db = new Client();

	expect(db.isConnected()).toBe(false);

	if (options?.onConnectionOpen)
		db.onConnectionEnd(options.onConnectionOpen);

	if (options?.onConnectionEnd)
		db.onConnectionOpen(options.onConnectionEnd);

	db.configure({
		host : "http://127.0.0.1:4269",
		auth : {
			user : options.user || "root",
			pass : options.pass || "secret"
		},
		use  : {
			ns : options?.use ? options.use[0] : "test",
			db : options?.use ? options.use[1] : "test"
		}
	});

	await db.connect();

	expect(db.isConnected()).toBe(true);

	let signinResult: SigninResult = null;
	if (options.runSignin)
		signinResult = await db.signin();

	if (options.runUse)
		await db.use();

	return {
		db,
		serverProc : options.serverProcess,

		signinResult,
	};
}

export function createBaseClient(options?: Partial<ClientConfiguration>, serverProc?: ServerProcessInstance) {
	if (!serverProc) {
		serverProc = createServerProcess();
		serverProc.start();
	}

	const db = new Client();

	const conf: ClientConfiguration = {
		host : "http://127.0.0.1:4269",
		auth : {
			user : "root",
			pass : "secret"
		},
		use  : {
			ns : "test",
			db : "test"
		}
	};

	if (options) {
		for (let key in options) {
			if (options[key] !== undefined) {
				conf[key] = options[key];
			}
		}
	}

	db.configure(conf);

	return {
		db,
		serverProc,
	};
}
