import {BaseResult} from "./BaseResult";

export class SigninResult extends BaseResult {

	private _token: string;

	public static successful(token: string): SigninResult {
		const result   = new SigninResult();
		result._status = true;
		result._token  = token;
		return result;
	}

	public static failed(error: string): SigninResult {
		const result   = new SigninResult();
		result._status = false;
		result._error  = error;
		return result;
	}


	public get token() {
		return this._token;
	}
}
