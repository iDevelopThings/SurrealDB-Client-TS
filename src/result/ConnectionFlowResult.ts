import {SigninResult} from "./SigninResult";
import {BaseResult} from "./BaseResult";
import {UseResult} from "./UseResult";

export enum ConnectionFlowStage {
	Connect = "connect",
	Signin  = "signin",
	Use     = "use",
}

export class ConnectionFlowResult extends BaseResult {

	private _signinResult: SigninResult;
	private _useResult: UseResult;
	private _currentStage: ConnectionFlowStage;
	private _failureStage: ConnectionFlowStage;

	constructor() {
		super();
		this._signinResult = new SigninResult();
		this._useResult    = new UseResult();
	}

	public setAuthResult(authResult: SigninResult): void {
		this._signinResult = authResult;

		if (authResult.didFail()) {
			this._failureStage = ConnectionFlowStage.Signin;
		}

		this.updateFrom(authResult);
	}

	public setUseResult(useResult: UseResult): void {
		this._useResult = useResult;

		if (useResult.didFail()) {
			this._failureStage = ConnectionFlowStage.Use;
		}

		this.updateFrom(useResult);
	}

	public get signin(): SigninResult {
		return this._signinResult;
	}

	public get use(): BaseResult {
		return this._useResult;
	}

	public get failureStage(): ConnectionFlowStage {
		return this._failureStage;
	}

	public set currentStage(stage: ConnectionFlowStage) {
		this._currentStage = stage;
	}

	public setError(error: Error) {
		super.setError(error);

		if (this._currentStage) {
			this._failureStage = this._currentStage;
		}
	}
}
