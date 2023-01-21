import {describe, it, vi, expect, beforeAll} from "vitest";
import {Client} from "../src/Client";
import {createServerProcess, createClient, Options, createBaseClient, CreatedClientUtil} from "./utils";
import {WebSocket} from "ws";
import {ConnectionFlowStage} from "../src/result/ConnectionFlowResult";

beforeAll(() => {
	// @ts-ignore
	globalThis.WebSocket = WebSocket;

});

describe("ConnectionState", () => {

	it("should call the callback when the connection fails to connect or it ends", async () => {
		const clientOptions = {
			onConnectionOpen    : vi.fn(() => {
				console.log("onOpen");
			}),
			onConnectionEnd     : vi.fn(() => {
				console.log("onEnd");
			}),
			onConnectionFailure : vi.fn(() => {
				console.log("onFailure");
			})
		} satisfies Options;

		let serverProc: CreatedClientUtil["serverProc"];

		try {
			const c    = await createClient(clientOptions);
			serverProc = c.serverProc;
		} catch (error) {
			console.error(error);
		}

		expect(clientOptions.onConnectionOpen).toBeCalledTimes(1);

		await serverProc.stop();

		expect(clientOptions.onConnectionEnd).toBeCalledTimes(1);
	});

	it("should throw an error when client fails to connect", async () => {
		const clientOptions = {
			onConnectionOpen    : vi.fn(() => {

			}),
			onConnectionEnd     : vi.fn(() => {
				console.log("onEnd");
			}),
			onConnectionFailure : vi.fn(() => {
				console.log("onFailure");
			}),

			startServer : false,
		} satisfies Options;

		let e = null;

		try {
			const {db, serverProc} = await createClient(clientOptions);
		} catch (error) {
			e = error;
		}
		expect(clientOptions.onConnectionOpen).toBeCalledTimes(0);
		expect(clientOptions.onConnectionEnd).toBeCalledTimes(0);
		expect(clientOptions.onConnectionFailure).toBeCalledTimes(1);

		expect(e).not.toBeNull();
		expect(e.message).toBe("connect ECONNREFUSED 127.0.0.1:4269");
	});

	it("should handle failed authentication correctly", async () => {
		const clientOptions = {
			user : "wrong",
			pass : "wrong",
		} satisfies Options;

		const {db, serverProc, signinResult} = await createClient(clientOptions);

		expect(signinResult).not.toBeNull();
		expect(signinResult.status).toBe(false);
		expect(signinResult.error).not.toBeNull();
		expect(signinResult.error).toBe("There was a problem with authentication");

	});

	describe("connection flow", () => {

		it("should connect successfully", async () => {

			const {db, serverProc} = await createBaseClient();

			const result = await db.startConnectionFlow();

			expect(result.failureStage).toBeUndefined();
			expect(result.status).toBeTruthy();
			expect(result.error).toBeUndefined();
			expect(result.didFail()).toBeFalsy();
			expect(result.didSucceed()).toBeTruthy();

			expect(result.signin.didSucceed()).toBeTruthy();
			expect(result.signin.didFail()).toBeFalsy();

			expect(result.use.didSucceed()).toBeTruthy();
			expect(result.use.didFail()).toBeFalsy();

			expect(db.isConnected()).toBeTruthy();
		});

		it("should fail when not able to connect", async () => {

			const {db, serverProc} = await createBaseClient(undefined, undefined, true);

			const result = await db.startConnectionFlow();

			expect(result.failureStage).toBe(ConnectionFlowStage.Connect);
			expect(result.status).toBeFalsy();
			expect(result.error).not.toBeUndefined();
			expect(result.didFail()).toBeTruthy();
			expect(result.didSucceed()).toBeFalsy();

			expect(result.signin.didSucceed()).toBeFalsy();
			expect(result.signin.didFail()).toBeTruthy();

			expect(result.use.didSucceed()).toBeFalsy();
			expect(result.use.didFail()).toBeTruthy();

			expect(db.isConnected()).toBeFalsy();
		});

		it("should fail authentication", async () => {
			const {db, serverProc} = await createBaseClient({
				auth : {user : "wrong", pass : "wrong"}
			});

			const result = await db.startConnectionFlow();

			expect(result.failureStage).toBe(ConnectionFlowStage.Signin);
			expect(result.status).toBeFalsy();
			expect(result.error).toBeDefined();
			expect(result.didFail()).toBeTruthy();
			expect(result.didSucceed()).toBeFalsy();

			expect(result.signin.didSucceed()).toBeFalsy();
			expect(result.signin.didFail()).toBeTruthy();

			expect(result.use.didSucceed()).toBeFalsy();
			expect(result.use.didFail()).toBeTruthy();

			expect(db.isConnected()).toBeFalsy();
		});

		// I don't think use statements can fail?
		// If they do though, they should be handled.
		/*it("should fail use", async () => {
			const {db, serverProc} = createBaseClient({
				use : {db : "wrong", ns : "wrong"}
			});

			const result = await db.startConnectionFlow();

			expect(result.failureStage).toBe(ConnectionFlowStage.Use);
			expect(result.status).toBeFalsy();
			expect(result.error).toBeDefined();
			expect(result.didFail()).toBeTruthy();
			expect(result.didSucceed()).toBeFalsy();

			expect(result.signin.didSucceed()).toBeFalsy();
			expect(result.signin.didFail()).toBeTruthy();

			expect(result.use.didSucceed()).toBeFalsy();
			expect(result.use.didFail()).toBeTruthy();

			expect(db.isConnected()).toBeFalsy();
		});*/

	});



});
