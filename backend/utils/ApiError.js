class ApiError extends Error {
    // `errorCode` is an optional stable, machine-readable code such as "NO_BANK_AVAILABLE", sent
    // to the client as `code` so an integration can branch on it instead of parsing the message.
    constructor(statusCode, message, errorCode){
        super(message);
        this.statusCode = statusCode;
        if (errorCode) this.errorCode = errorCode;
    }
}

module.exports=ApiError;