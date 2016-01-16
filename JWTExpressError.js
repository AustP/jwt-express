var JWTExpressError = function(message) {
    this.name = 'JWTExpressError';
    this.message = message;
    Error.captureStackTrace(this, JWTExpressError);
}
JWTExpressError.prototype = Object.create(Error.prototype);
JWTExpressError.prototype.constructor = JWTExpressError;

module.exports = JWTExpressError;
