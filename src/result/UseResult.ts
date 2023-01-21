import {BaseResult} from "./BaseResult";

export class UseResult extends BaseResult {

	public data: any;

	public static successful(data: any): UseResult {
		const result   = new UseResult();
		result._status = true;
		result.data    = data;
		return result;
	}

	public static failed(error: string): UseResult {
		const result   = new UseResult();
		result._status = false;
		result._error  = error;
		return result;
	}


}
