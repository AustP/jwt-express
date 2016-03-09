# jwt-express
Climb aboard the JWT Express and use JWTs in your Express app with ease!

Out of the box, this library will implement session storage using JWTs. It does this by storing and reading JWTs to and from cookies. It can be configured however, to read JWTs out of the Authorization header instead (useful for REST APIs).

## Introduction
If you don't know what a JWT is, go [learn about JWTs](https://jwt.io) before continuing...

Now that you know why JWTs are all the rage, wouldn't it be nice if you could start using them in your Express app? JWTs are perfect to use in REST APIs, but they can also be used in everyday web applications to leverage session data while keeping the server stateless. This is accomplished by storing the JWT in a cookie.

*Wait a minute, aren't we using JWTs to avoid using cookies?* The answer to that question is: not quite. The way cookies have been used in the past is we store a session ID in them, and on subsequent requests, read that ID back. Then with that ID, we use that to look up session data for the user  from the file system or from a database. But since the JWT contains all the information we need, it saves us the file system / DB look up, thus keeping the server stateless.

## Security
1. JWTs are signed by us, so we can verify their integrity.
2. As long as we use HTTP-only cookies, JavaScript can't read our JWTs.

The issue then that we need to be aware of (and this isn't a new issue) is [CSRF](https://en.wikipedia.org/wiki/Cross-site_request_forgery). Quick recap on CSRF: Let's say your bank's website is bank.com and after you check your balance, you visit badsite.com without logging out. While on badsite.com, they submit a hidden form: `<form method="post" action="bank.com/transferAllFunds/badguy@badsite.com">` At this point, your browser will make a request to bank.com and include bank.com's cookie in that request. When bank.com gets the request, it will see that you're logged in (because your cookie was sent) and transfer all of your funds to badguy@badsite.com.

If I just freaked you out, I apologize. Go read up on [CSRF prevention](https://en.wikipedia.org/wiki/Cross-site_request_forgery#Prevention) and apply the best technique(s) for your situation. Personally I'd recommend using the [Synchronizer Token Pattern](https://en.wikipedia.org/wiki/Cross-site_request_forgery#Synchronizer_token_pattern) for a normal web application and the [Cookie-to-Header Token](https://en.wikipedia.org/wiki/Cross-site_request_forgery#Cookie-to-Header_Token) for REST APIs. If you implement either of these methods (and prevent [XSS](https://en.wikipedia.org/wiki/Cross-site_scripting)), then using JWTs in cookies is secure. If you are doing nothing to prevent CSRF or XSS, then they are just as secure as using a general cookie / session store.

One last note on security: jwt-express defaults to marking JWTs as stale (different than expired) after a period of 15 minutes of inactivity. So while a user is browsing your site, `jwt.stale == false` but after 15 minutes of inactivity, `jwt.stale == true`. When the user comes back after these 15 minutes, their JWT will still probably be valid (`jwt.valid` only tells you if the payload can be trusted). So if you only need session data, it's fine to only check for a valid JWT, but if you are making changes for the user (such as transferring funds) it's best to make sure that their JWT is active (valid and fresh). (There are [helper methods](#methods) for you to easily check these things.)

## Installation

    npm install jwt-express --save

## Usage

    var jwt = require('jwt-express');
    app.use(jwt.init('secret'));

The `jwt.init()` function returns a middleware function for Express so it must be called inside `app.use()`. It will automatically read in the JWT from either the cookie or the Authorization header (configured by you) and add a [JWT object](#JWTObject) to the Request object (`req`). It will also add the [`jwt()`](#resjwt) method to the Response object (`res`) to create / store JWTs. *`jwt.init()` must be called before any other jwt method.*

#### jwt.init(string|function secret, [object options])

*secret* - can be either a function or a string. If it is a string, that will be used to sign / verify with. If it is a function, that function must return a string. The returned string will be used to sign / verify with. When the function is called, it will be called with the Request object (`req`) as the first parameter.

*options* - must be an object. These are the available options:
- cookie: (string) The name of the cookie (default: `'jwt-express'`)
- cookieOptions: (object) Options to use when storing the cookie (default: `{httpOnly: true}`)
- cookies: (boolean) If true, will use cookies, otherwise will use the Authorization header (default: `true`)
- refresh: (boolean) Indicates if the JWT should be refreshed and stored every request (default: `true`)
- reqProperty: (string) The property of req to populate (default: `'jwt'`)
- revoke: (function) `jwt.revoke()` will call this function (default: `function(jwt) {}`)
- signOptions: (object) Options to use when signing the JWT (default: `{}`)
- stales: (number) Milliseconds when the jwt will go stale (default: `900000` (15 minutes))
- verify: (function) Additional verification. Must return a boolean (default: `function(jwt) {return true}`)
- verifyOptions: (object) Options to use when verifying the JWT (default: `{}`)

When storing the cookie, jwt-express calls [res.cookie()](http://expressjs.com/en/api.html#res.cookie) and will pass cookieOptions to that function.

Internally when signing / verifying JWTs, jwt-express uses [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) so signOptions will be passed to `jsonwebtoken.sign()` and verifyOptions will be passed to `jsonwebtoken.verify()`.

### Other Methods <a name="methods"></a>
#### jwt.active()
Returns a middleware function that ensures a JWT is valid and fresh. Useful to protect sensitive actions from CSRF. This method will trigger error handling if the JWT is not active.

    app.post('/transferFunds', jwt.active(), function(req, res) { ... });

#### jwt.clear()
If using cookies, this method will clear the current JWT out of the cookie.

#### jwt.create(string|function secret, object payload)
Returns a newly created / signed [JWT Object](#JWTObject) from the payload.

*secret* - can be either a function or a string. If it is a string, that will be used to sign / verify with. If it is a function, that function must return a string. The returned string will be used to sign / verify with. When the function is called, it will be called with the payload object as the first parameter.

*payload* - the payload to use.

#### jwt.require(string key, [string operator, mixed value])
Returns a middleware function that requires the payload to contain / match certain data. This method will trigger error handling if the JWT fails the requirement.

*key* - This is they key used to look up the value in the payload. If only this value is passed to `jwt.require()`, then the middleware function will check that the value is truthy (value == true).

*operator* - If supplied, must be one of the following:

- ==
- ===
- !=
- !==
- &lt;
- &lt;=
- &gt;
- &gt;=

*value* - The value to compare the payload data against

    app.get('/admin', jwt.require('admin'), function(req, res) { ... });
    app.get('/level4', jwt.require('level', '>', 3), function(req, res) { ... });

#### jwt.valid()
Returns a middleware function that ensures a JWT is valid. This method will trigger error handling if the JWT is not valid.

    app.get('/dashboard', jwt.valid(), function(req, res) { ... });

## Response Object
#### res.jwt(object payload) <a name="resjwt"></a>
Returns a newly created / signed [JWT Object](#JWTObject) from the payload. If you are using cookies, it will automatically store the JWT in the cookie as well.

*payload* - the payload to use.

    app.post('/login', function(req, res) {
        var user = getUserDataSomehow();
        
        // we are using cookies so the JWT is 
        // automatically stored for us
        var jwt = res.jwt({
            admin: user.is_admin,
            name: user.first + ' ' + user.last
        });
        
        // we now have access to the JWT Object
        console.log(jwt);
        
        // if we weren't using cookies, we could
        // now send the token to the client
        res.send(jwt.token);
    });

## JWT Object <a name="JWTObject"></a>
The JWT Object represents a JWT. It contains the token, the payload, and the state of the JWT.

### Properties
#### expired | boolean
Indicates if the JWT is expired. `valid` will always be false if this is true.

#### payload | object
The payload of the JWT (must be an object). jwt-express will add a `stales` key-value pair to the payload for `stale`.

#### stale | boolean
Indicates if the JWT is stale. The default timeout before a JWT is considered stale is 15 minutes.

#### token | string
The signed token of the JWT.

#### valid | boolean
Indicates if this JWT is valid. This means that the payload hasn't been tampered with and that the JWT hasn't expired yet.

### Methods
#### resign()
Resigns this JWT Objects's payload.

#### revoke()
Calls the revoke function defined in the `jwt.init()` options with this JWT Object as the first parameter.

#### sign(object payload)
Generates a signed token from the payload.

#### store(Response res)
Stores this JWT in the cookie (if configured to use cookies).

#### verify(string token)
Verify the token and load the info into this JWT.

## Error Handling
Some of the [helper methods](#methods) will trigger error handling. If you are doing [custom error handling](http://expressjs.com/en/guide/error-handling.html) you can check for a `JWTExpressError`. When this error is passed, it means the user is unauthorized. Here is an example error handler:

    app.use(function(err, req, res, next) {
        if (err.name == 'JWTExpressError') {
            // user is unauthorized
            res.status(401);
            res.render('401', {error: err});
        } else {
            next(err);
        }
    });
