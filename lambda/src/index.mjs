"use strict";
import {
    attachEbs,
    stopInstance,
    migrate,
    startInstance,
    terminateInstance,
    allowCurrentIp,
    revokeIp,
    putSshKey, updateAlias
} from "./api.mjs";
import home from "./home.mjs";
import { readFileSync } from 'fs'
import {getPayload, handleRequest, responseCookie} from "./auth.mjs";
import {SSMClient, GetParametersByPathCommand, GetParameterCommand, PutParameterCommand, ParameterType} from "@aws-sdk/client-ssm";
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    const data = await (new SSMClient({region: 'eu-central-1'}))
        .send(new GetParametersByPathCommand({
            Path: path,
            WithDecryption: true
        }))

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
export async function handler(request, context, callback) {
    console.log(JSON.stringify(request))

    if (request.body && request.isBase64Encoded) {
        request.body = Buffer.from(request.body, 'base64').toString('utf8')
    }

    const ip = request.requestContext.http.sourceIp

    await paramsGet()

    const host = request.headers.host;

    // explicitly call middleware
    if (request.rawPath === '/auth') {
        return await handleRequest(request, Params);
    }

    // explicitly expire token
    if (request.rawPath === '/auth/expire') {
        return responseCookie("", new Date(0), `https://${host}/auth`);
    }

    // EC2 api
    if (request.rawPath === '/attach-ebs') {
        await attachEbs(request.queryStringParameters.user)
        return createJsonResponse(true, 200)
    }

    // DNS alias
    if (request.rawPath === '/update-alias') {
        await updateAlias(request.queryStringParameters.user)
        return createJsonResponse(true, 200)
    }

    // if token is valid make original request
    // if invalid call middleware
    let payload
    try {
        payload = getPayload(request, Params)
    } catch (err) {
        return await handleRequest(request, Params);
    }
    console.log(JSON.stringify(payload))

    const ssm = new SSMClient({region: 'eu-central-1'});
    const parameterPath = '/ec2/region/' + payload.sub.replace('@', '-')
    let region
    try {
        region = (await ssm
            .send(new GetParameterCommand({
                Name: parameterPath,
                WithDecryption: true
            }))).Parameter.Value
    } catch (e) {
        if (e.name === 'ParameterNotFound') {
            region = 'eu-central-1'
            await ssm.send(new PutParameterCommand({
                Name: parameterPath,
                Value: region,
                Type: ParameterType.SECURE_STRING,
                Overwrite: false
            }))
        } else {
            throw e
        }
    }

    if (request.rawPath === '/') {
        return {
            statusCode: 200,
            headers: {
                "Content-Type": "text/html; charset=UTF-8",
            },
            body: await home(payload.sub, region, ip),
            isBase64Encoded: false
        }
    }
    if (request.rawPath === '/favicon.ico') {
        return {
            statusCode: 200,
            headers: {
                "Content-Type": "image/ico",
            },
            body: readFileSync(__dirname + '/../favicon.ico', 'base64'),
            isBase64Encoded: true
        }
    }

    try {
        if (request.rawPath === '/api/start-instance') {
            return createJsonResponse(await startInstance(region, payload.sub, payload.name, ip, request.queryStringParameters.type), 200)
        }

        if (request.rawPath === '/api/stop-instance') {
            return createJsonResponse(await stopInstance(region, payload.sub), 200)
        }

        if (request.rawPath === '/api/terminate-instance') {
            return createJsonResponse(await terminateInstance(region, payload.sub), 200)
        }
        if (request.rawPath === '/api/migrate-instance') {
            return createJsonResponse(await migrate(payload.sub, region, request.queryStringParameters.target), 200)
        }
        if (request.rawPath === '/api/allow-current-ip') {
            return createJsonResponse(await allowCurrentIp(payload.sub, region, ip), 200)
        }
        if (request.rawPath === '/api/revoke-ip') {
            return createJsonResponse(await revokeIp(payload.sub, region, request.queryStringParameters.ip), 200)
        }
        if (request.rawPath === '/api/update-ssh-key') {
            return createJsonResponse(await putSshKey(payload.sub, JSON.parse(request.body).key), 200)
        }
    } catch (err) {
        console.error(err)
        console.error(JSON.stringify(err))
        if (err.errorMessage) {
            return createJsonResponse({error: err.errorMessage}, 500);
        }
        if (err.message) {
            return createJsonResponse({error: err.message}, 500);
        }
        if (err.error && err.error.message) {
            return createJsonResponse({error: err.error.message}, 500);
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

}
