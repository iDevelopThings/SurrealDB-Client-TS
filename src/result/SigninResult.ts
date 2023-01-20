export class SigninResult {
	private _success: boolean;
	private _error: string;
	private _token: string;

	public static successful(token: string): SigninResult {
		const result    = new SigninResult();
		result._success = true;
		result._token   = token;
		return result;
	}

	public static failed(error: string): SigninResult {
		const result    = new SigninResult();
		result._success = false;
		result._error   = error;
		return result;
	}

	public get success() {
		return this._success;
	}

	public get error() {
		return this._error;
	}

	public get token() {
		return this._token;
	}
}
