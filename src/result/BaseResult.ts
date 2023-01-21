export class BaseResult {
	protected _status: boolean = false;
	protected _error: string;

	public setError(error: Error) {
		this._error  = error.message;
		this._status = false;
	}

	public get status() {
		return this._status;
	}

	public get error() {
		return this._error;
	}

	public set status(value: boolean) {
		this._status = value;
	}

	public set error(value: string | Error) {
		this._error = typeof value === "string" ? value : value.message;
	}

	public didFail(): boolean {
		return !this._status || this._error !== undefined;
	}

	public didSucceed(): boolean {
		return this._status && !this._error;
	}

	public static forError(error: Error) {
		const result = new BaseResult();
		result.setError(error);
		return result;
	}

	public static forSuccess() {
		const result  = new BaseResult();
		result.status = true;
		return result;
	}

	protected updateFrom(result: BaseResult) {
		if (result.status !== undefined) {
			this._status = result.status;
		}

		if (result.error !== undefined) {
			this._error = result.error as string;
		}
	}
}
