"use strict";
import {Strategy as AwsStrategy} from "passport-saml";
import jwt from 'jwt-simple'
import {parse as parseQueryString} from 'querystring'

const responseError = (err) => {
    const response = {
        statusCode: "401",
        headers: {
            "content-type": "text/plain",
        },
        body: JSON.stringify(err),
    }
    console.log(JSON.stringify(response))
    return response;
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

export function responseCookie (token, exp, host, url) {
    const r = responseRedirect(`https://${host}${url}`);
    const path = url ? url.split('/')[1] : ''
    if (path === '/') {
        return r;
    }
    r.cookies = [`access_token=${token}; expires=${exp.toUTCString()}; path=/${path}`]
    return r;
}

const responseRedirect = (location) => ({
    statusCode: "302",
    headers: {
        location: location
    },
});

export function handleRequest(request, Params) {
    return new Promise(function (fulfill) {
        const host = request.headers.host;
        const body = parseQueryString(request.body)

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
            fulfill(responseError(err));
        };

        s.fail = (warning) => {
            console.log(JSON.stringify(warning));
            fulfill(responseError(warning));
        };

        s.redirect = (url) => {
            fulfill(responseRedirect(url));
        };

        s.success = (response) => {
            const exp = new Date(response.profile.getAssertion().Assertion.AuthnStatement[0].$.SessionNotOnOrAfter);
            const key = Buffer.from(Params['auth-hash-key'], "base64");
            const token = jwt.encode({
                exp: Math.floor(exp / 1000),
                sub: response.profile.nameID,
                name: response.profile.attributes.DisplayName
            }, key);

            fulfill(responseCookie(token, exp, host, response.url));
        };

        s.authenticate({body}, {additionalParams: {RelayState: request.rawPath === '/auth' ? '/' : request.rawPath}});
    });
}


export function getPayload(request, Params) {
    return jwt.decode(requestCookie(request, "access_token"), Buffer.from(Params['auth-hash-key'], "base64"));
}
