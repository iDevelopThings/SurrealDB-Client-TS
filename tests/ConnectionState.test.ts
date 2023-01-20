import {describe, it, vi, expect, beforeAll} from "vitest";
import {Client} from "../src/Client";
import {createServerProcess, createClient, Options} from "./utils";
import {WebSocket} from "ws";

beforeAll(() => {
	// @ts-ignore
	globalThis.WebSocket = WebSocket;
});

describe("ConnectionState", () => {

	it("should call the callback when the connection fails to connect or it ends", async () => {
		const clientOptions = {
			onConnectionOpen : vi.fn(() => {

			}),
			onConnectionEnd  : vi.fn(() => {
				console.log("onEnd");
			})
		} satisfies Options;

		const {db, serverProc} = await createClient(clientOptions);

		expect(clientOptions.onConnectionOpen).toBeCalledTimes(1);

		serverProc.stop();

		expect(clientOptions.onConnectionEnd).toBeCalledTimes(1);
	});

	it("should handle failed authentication correctly", async () => {
		const clientOptions = {
			user : "wrong",
			pass : "wrong",
		} satisfies Options;

		const {db, serverProc, signinResult} = await createClient(clientOptions);

		expect(signinResult).not.toBeNull();
		expect(signinResult.success).toBe(false);
		expect(signinResult.error).not.toBeNull();
		expect(signinResult.error).toBe("There was a problem with authentication");

	});

});
