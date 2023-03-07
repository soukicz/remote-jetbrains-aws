"use strict";
const fs = require('fs')
const AWS = require('aws-sdk')
const auth = require('./auth')
const home = require('./home')
const api = require('./api')

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

function createJsonResponse(body, status) {
    return {
        statusCode: 200,
        headers: {
            "Content-Type": "application/json; charset=UTF-8",
        },
        body: body,
        isBase64Encoded: false
    }
}

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

    const ip = request.requestContext.http.sourceIp

    await paramsGet()

    const host = request.headers.host;

    // explicitly call middleware
    if (request.rawPath === '/auth')
        return await auth.handleRequest(request, Params);

    // explicitly expire token
    if (request.rawPath === '/auth/expire')
        return auth.responseCookie("", new Date(0), `https://${host}/auth`);

    // if token is valid make original request
    // if invalid call middleware
    let payload
    try {
        payload = auth.getPayload(request, Params)
    } catch (err) {
        return await auth.handleRequest(request, Params);
    }
    console.log(JSON.stringify(payload))

    const region = (await (new AWS.SSM({region: 'eu-central-1'}))
        .getParameter({
            Name: '/ec2/region/' + payload.sub.replace('@', '-'),
            WithDecryption: true
        }).promise()).Parameter.Value

    if (request.rawPath === '/') {
        return {
            statusCode: 200,
            headers: {
                "Content-Type": "text/html; charset=UTF-8",
            },
            body: await home.render(payload.sub, region),
            isBase64Encoded: false
        }
    }
    if (request.rawPath === '/favicon.ico') {
        return {
            statusCode: 200,
            headers: {
                "Content-Type": "image/ico",
            },
            body: fs.readFileSync(__dirname + '/../favicon.ico', 'base64'),
            isBase64Encoded: true
        }
    }

    try {
        if (request.rawPath === '/api/start-instance') {
            return createJsonResponse(await api.startInstance(region, payload.sub, payload.name, ip, request.queryStringParameters.type), 200)
        }

        if (request.rawPath === '/api/hibernate-instance') {
            return createJsonResponse(await api.hibernateInstance(region, payload.sub), 200)
        }

        if (request.rawPath === '/api/terminate-instance') {
            return createJsonResponse(await api.terminateInstance(region, payload.sub), 200)
        }
        if (request.rawPath === '/api/migrate-instance') {
            return createJsonResponse(await api.migrate(payload.sub, region, request.queryStringParameters.target), 200)
        }
    } catch (err) {
        console.error(JSON.stringify(err))
        if (err.errorMessage) {
            return createJsonResponse({error: err.errorMessage}, 500);
        }

        return createJsonResponse({error: JSON.stringify(err.errorMessage)}, 500);
    }

    return {
        statusCode: 404,
        headers: {
            "Content-Type": "text/plaint; charset=UTF-8",
        },
        body: "HTTP 404 - Not Found",
        isBase64Encoded: false
    }


};
