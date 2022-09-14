"use strict";
const AWS = require('aws-sdk')
const AwsStrategy = require('passport-saml').Strategy;
const jwt = require("jwt-simple");
const querystring = require("querystring");

// global const reused across invocations
const Params = {
    'auth-domain-name': undefined,
    'auth-hash-key': undefined,
    'private-key': undefined,
    'issuer-certificate': undefined,
};

const requestCookie = (request, name) => {
    const cookies = {};
    if (request.cookies) {
        request.cookies.forEach((cookie) => {
            if (cookie) {
                const parts = cookie.split("=");
                cookies[parts[0].trim()] = parts[1].trim();
            }
        });
    }

    return cookies[name];
};

const responseCookie = (token, exp, host, url) => {
    const r = responseRedirect(`https://${host}${url}`);
    const path = url ? url.split('/')[1] : ''
    if (path === '/') {
        return r;
    }
    r.cookies = [`access_token=${token}; expires=${exp.toUTCString()}; path=/${path}`]
    return r;
};

const responseError = (err) => {
    const response = {
        status: "401",
        statusDescription: "Unauthorized",
        headers: {
            "content-type": [{
                key: "Content-Type",
                value: "text/html",
            }],
        },
        body: JSON.stringify(err),
    }
    console.log(JSON.stringify(response))
    return response;
};

const responseRedirect = (location) => ({
    status: "302",
    statusDescription: "Found",
    headers: {
        location: [{
            key: "Location",
            value: location,
        }],
    },
});

const auth = (request, callback) => {
    const host = request.headers.host[0].value;
    const body = querystring.parse(Buffer.from(request.body.data, 'base64').toString('utf8'));

    const s = new AwsStrategy({
        passReqToCallback: true,
        callbackURL: `https://${host}/auth`,
        host: host,
        path: '/auth',
        protocol: 'https',
        entryPoint: 'https://portal.sso.eu-west-1.amazonaws.com/saml/assertion/MDU3NzQ4MDUyODY2X2lucy0xODg4NDAxMzU0YWFiNWUz',
        issuer: 'https://portal.sso.eu-west-1.amazonaws.com/saml/assertion/MDU3NzQ4MDUyODY2X2lucy0xODg4NDAxMzU0YWFiNWUz',
        audience: 'jetbrains',
        signatureAlgorithm: 'sha256',
        wantAssertionsSigned: true,
        privateKey: Params['private-key'],
        cert: Params['issuer-certificate'],
    }, (req, profile, done) => {

        if (profile.nameID.endsWith(Params['auth-domain-name'])) {
            return done(null, {
                profile,
                url: req.body.RelayState
            }); // call success with profile
        }

        // call fail with warning
        done(null, false, {
            name: "UserError",
            message: "Email is not a member of the domain",
            status: "401",
        });
    });

    s.error = (err) => {
        console.log(JSON.stringify(err));
        callback(null, responseError(err));
    };

    s.fail = (warning) => {
        console.log(JSON.stringify(warning));
        callback(null, responseError(warning));
    };

    s.redirect = (url) => {
        callback(null, responseRedirect(url));
    };

    s.success = (response) => {
        const exp = new Date(response.profile.getAssertion().Assertion.AuthnStatement[0].$.SessionNotOnOrAfter);
        const key = Buffer.from(Params['auth-hash-key'], "base64");
        const token = jwt.encode({
            exp: Math.floor(exp / 1000),
            sub: response.profile.nameID,
        }, key);

        callback(null, responseCookie(token, exp, host, response.url));
    };

    s.authenticate({body}, {additionalParams: {RelayState: request.uri === '/auth' ? '/' : request.uri}});
};

const paramsGet = () => (new Promise(function (fulfill, reject) {
    // immediate return cached params if defined
    if (Params['auth-domain-name'] !== undefined) return fulfill();

    const path = '/sso/';

    (new AWS.SSM({region: 'eu-central-1'}))
        .getParametersByPath({
            Path: path,
            WithDecryption: true
        })
        .promise()
        .then(data => {
            data.Parameters.forEach((p) => {
                Params[p.Name.slice(path.length)] = p.Value;
            })
            console.log(JSON.stringify(Params))
            fulfill()
        })
        .catch(err => (reject(err)));
}));

/**
 *
 * @param request
 * @param request.rawPath
 * @param request.headers
 * @param request.cookies
 * @param context
 * @param callback
 */
exports.handler = async (request, context, callback) => {
    await paramsGet()

    const host = request.headers.host;

    // explicitly call middleware
    if (request.rawPath === '/auth')
        return auth(request, callback);

    // explicitly expire token
    if (request.rawPath === '/auth/expire')
        return callback(null, responseCookie("", new Date(0), `https://${host}/auth`));

    // if token is valid make original request
    // if invalid call middleware
    try {
        const payload = jwt.decode(requestCookie(request, "access_token"), Buffer.from(Params['auth-hash-key'], "base64"));

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "text/html",
            },
            "body": "<h1>ok</h1>",
            "isBase64Encoded": false
        }
    } catch (err) {
        auth(request, callback);
    }

};
