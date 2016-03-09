var utils = require('jsonwebtoken'),
JWTExpressError = require('./JWTExpressError');

/**
 * JWT - Class representing a JSON Web Token, it's payload, and it's status
 * @param string secret The secret to sign / verify with
 * @param object options The jwt-express options
 */
function JWT(secret, options) {
    this.token = '';
    this.payload = {};
    this.secret = secret;
    this.options = options;
    this.valid = false;
    this.expired = false;
    this.stale = true;
}
JWT.prototype = {
    /**
     * resign - resigns this JWT's payload
     * @return this
     */
    resign: function() {
        return this.sign(this.payload);
    },
    
    /**
     * revoke - calls the revoke function defined in the options with this
     *     as the first parameter
     * @return this
     */
    revoke: function() {
        this.options.revoke(this);
        return this;
    },
    
    /**
     * sign - generate a new token from the payload
     * @param object payload The payload to sign
     * @return this
     */
    sign: function(payload) {
        payload.stales = Date.now() + this.options.stales;
        
        this.payload = payload;
        this.token = utils.sign(this.payload, this.secret, this.options.signOptions);
        this.valid = true;
        this.expired = false;
        this.stale = false;
        
        return this;
    },
    
    /**
     * store - stores the JWT in the cookie
     * @param object res The Express HTTP Response object
     * @return this
     */
    store: function(res) {
        if (this.options.cookies) {
            res.cookie(this.options.cookie, this.token, this.options.cookieOptions);
        }
        
        return this;
    },
    
    /**
     * toJSON - this function is called when the jwt is passed through JSON.stringify
     *     we don't want the secret or options to be stringified
     * @return object
     */
    toJSON: function() {
        return {
            token: this.token,
            payload: this.payload,
            valid: this.valid,
            expired: this.expired,
            stale: this.stale
        };
    },
    
    /**
     * verify - verifies the JWT's token
     * @param string token The token to verify
     * @return this
     */
    verify: function(token) {
        this.token = token || '';
        
        try {
            this.payload = utils.verify(this.token, this.secret, this.options.verifyOptions);
            this.valid = true;
        } catch (err) {
            this.payload = utils.decode(this.token) || {};
            if (err.name == 'TokenExpiredError') {
                this.expired = true;
            }
        }
        
        if (this.valid && !this.options.verify(this)) {
            this.valid = false;
        }
        
        if (this.payload.stales && Date.now() <= this.payload.stales) {
            this.stale = false;
        }
        
        return this;
    }
};

module.exports = {
    /**
     * active - requires that a JWT is valid and not stale
     * @return function middleware
     */
    active: function() {
        return function(req, res, next) {
            var jwt = req[this.options.reqProperty] || {};
            
            if (!jwt.valid) {
                next(new JWTExpressError('JWT is invalid'));
            } else if (jwt.stale) {
                next(new JWTExpressError('JWT is stale'));
            } else {
                next();
            }
        }.bind(this);
    },
    
    /* 
     * clear - will be overwritten
     * if cookies are in use, this method will clear the cookie
     */
    clear: function() {
        throw new JWTExpressError('init must be called before clear');
    },
    
    /*
     * create - creates a JWT without storing it
     * @param string|function secret If secret is a string, that will be used
     *     to verify / sign with. If secret is a function, that function will be
     *     called with the payload as it's first parameter, and must
     *     return a string which will be used to verify / sign with.
     * @param object payload The payload of the JWT
     * @return JWT
     */
    create: function(secret, payload) {
        if (!secret) {
            throw new ReferenceError('secret must be defined');
        }
        
        if (typeof secret == 'string') {
            var _secret = secret;
            secret = function(payload) {return _secret};
        }
        
        var jwt = new JWT(secret(payload), this.options);
        return jwt.sign(payload);
    },
    
    /**
     * init - initialize jwt-express
     * @param string|function secret If secret is a string, that will be used
     *     to verify / sign with. If secret is a function, that function will be
     *     called with the Express HTTP Request as it's first parameter, and must
     *     return a string which will be used to verify / sign with.
     * @param object options (Optional) The options of jwt-express
     *     cookie:        The name of the cookie (default: 'jwt-express')
     *     cookieOptions: Options to use when storing the cookie
     *                    (default: {httpOnly: true})
     *     cookies:       Boolean indicating to use cookies to look for / save the JWTs
     *                    or to use the Authorization header to look for the JWTs (default: true)
     *     refresh:       Boolean indicating if the JWT should be refreshed and stored every request
     *     reqProperty:   The property of req to populate (default: 'jwt')
     *     revoke:        The function to call when jwt.revoke() is called
     *                    (default: function(jwt) {})
     *     signOptions:   Options to use when signing the JWT (default: {})
     *     stales:        Milliseconds when the jwt will go stale
     *     verify:        Additional function to call when verifying a JWT
     *                    (default: function(jwt) {return true})
     *     verifyOptions: Options to use when verifying the JWT (default: {})
     * @return function middleware
     */
    init: function(secret, options) {
        if (!secret) {
            throw new ReferenceError('secret must be defined');
        }
        
        if (typeof secret == 'string') {
            var _secret = secret;
            secret = function(req) {return _secret};
        }
        
        options = options || {};
        var defaults = {
            cookie: 'jwt-express',
            cookieOptions: {
                httpOnly: true
            },
            cookies: true,
            refresh: true,
            reqProperty: 'jwt',
            revoke: function(jwt) {},
            signOptions: {},
            stales: 900000,
            verify: function(jwt) {return true},
            verifyOptions: {}
        };
        
        for (var key in defaults) {
            this.options[key] = options[key] !== undefined? options[key]: defaults[key];
        }
        
        return function(req, res, next) {
            var token;
            if (this.options.cookies) {
                token = req.cookies[this.options.cookie];
            } else if (req.headers.authorization) {
                // Authorization: Bearer abc.abc.abc
                token = req.headers.authorization.split(' ')[1];
            }
            
            var jwt = new JWT(secret(req), this.options);
            req[this.options.reqProperty] = jwt.verify(token);
            
            if (jwt.valid && !jwt.stale && jwt.options.refresh) {
                jwt.resign().store(res);
            }
            
            /**
             * jwt - Creates and signs a new JWT. If cookies are in use, it stores
             *     the JWT in the cookie as well.
             * @param object payload The payload of the JWT
             * @return JWT
             */
            res.jwt = function(payload) {
                var jwt = new JWT(secret(req), this.options);
                return jwt.sign(payload).store(res);
            }.bind(this);
            
            this.clear = function() {
                if (this.options.cookies) {
                    res.clearCookie(this.options.cookie);
                }
            }.bind(this);
            
            next();
        }.bind(this);
    },
    
    options: {},
    
    /**
     * require - requires that data in the JWT's payload meets certain requirements
     *     If only the key is passed, it simply checks that payload[key] == true
     * @param string key The key used to load the data from the payload
     * @param string operator (Optional) The operator to compare the information
     * @param mixed value (Optional) The value to compare the data to
     * @return function middleware
     */
    require: function(key, operator, value) {
        if (!key) {
            throw new ReferenceError('key must be defined');
        }
        if (operator && ['==','===','!=','!==','<','<=','>','>='].indexOf(operator) === -1) {
            throw new JWTExpressError('Invalid operator: ' + operator);
        }
        
        return function(req, res, next) {
            var jwt = req[this.options.reqProperty] || {payload: {}},
            data = jwt.payload[key],
            ok;
            
            if (!operator) {
                operator = '==';
                value = true;
            }
            
            if (operator == '==') {
                ok = data == value;
            } else if (operator == '===') {
                ok = data === value;
            } else if (operator == '!=') {
                ok = data != value;
            } else if (operator == '!==') {
                ok = data !== value;
            } else if (operator == '<') {
                ok = data < value;
            } else if (operator == '<=') {
                ok = data <= value;
            } else if (operator == '>') {
                ok = data > value;
            } else if (operator == '>=') {
                ok = data >= value;
            }
            
            if (!ok) {
                var err = new JWTExpressError('JWT is insufficient');
                err.key = key;
                err.data = data;
                err.operator = operator;
                err.value = value;
                
                next(err);
            } else {
                next();
            }
        }.bind(this);
    },
    
    /**
     * valid - requires that a JWT is valid
     * @return function middleware
     */
    valid: function() {
        return function(req, res, next) {
            var jwt = req[this.options.reqProperty] || {};
            
            if (!jwt.valid) {
                next(new JWTExpressError('JWT is invalid'));
            } else {
                next();
            }
        }.bind(this);
    }
};
