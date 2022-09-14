"use strict";
const AWS = require('aws-sdk')
const auth = require('./auth')

// global const reused across invocations
const Params = {
    'auth-domain-name': undefined,
    'auth-hash-key': undefined,
    'private-key': undefined,
    'issuer-certificate': undefined,
};

const paramsGet = async () => {
    // immediate return cached params if defined
    if (Params['auth-domain-name'] !== undefined) return;
    const path = '/sso/';
    const data = await (new AWS.SSM({region: 'eu-central-1'}))
        .getParametersByPath({
            Path: path,
            WithDecryption: true
        }).promise()

    data.Parameters.forEach((p) => {
        Params[p.Name.slice(path.length)] = p.Value;
    })
};

/**
 *
 * @param request
 * @param request.rawPath
 * @param request.headers
 * @param request.cookies
 * @param request.isBase64Encoded
 * @param context
 * @param callback
 */
exports.handler = async (request, context, callback) => {
    console.log(JSON.stringify(request))

    if (request.body && request.isBase64Encoded) {
        request.body = Buffer.from(request.body, 'base64').toString('utf8')
    }

    await paramsGet()

    const host = request.headers.host;

    // explicitly call middleware
    if (request.rawPath === '/auth')
        return await auth.handleRequest(request);

    // explicitly expire token
    if (request.rawPath === '/auth/expire')
        return auth.responseCookie("", new Date(0), `https://${host}/auth`);

    // if token is valid make original request
    // if invalid call middleware
    try {
        const payload = auth.getPayload(request, Params)
        console.log(JSON.stringify(payload))

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "text/html",
            },
            body: "<h1>ok</h1>",
            isBase64Encoded: false
        }
    } catch (err) {
        return await auth.handleRequest(request);
    }

};
