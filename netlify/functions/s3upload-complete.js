const { APS_CLIENT_ID, APS_CLIENT_SECRET } = process.env;

// Helper function to get internal token
async function getInternalToken() {
    const response = await fetch('https://developer.api.autodesk.com/authentication/v2/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            client_id: APS_CLIENT_ID,
            client_secret: APS_CLIENT_SECRET,
            grant_type: 'client_credentials',
            scope: 'data:read data:write'
        })
    });

    if (!response.ok) {
        throw new Error(`APS authentication failed: ${response.status}`);
    }

    const data = await response.json();
    return data.access_token;
}

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    try {
        if (event.httpMethod !== 'POST') {
            return {
                statusCode: 405,
                headers,
                body: JSON.stringify({ error: 'Method not allowed' })
            };
        }

        const { bucketKey, objectKey, uploadKey } = JSON.parse(event.body || '{}');
        
        if (!bucketKey || !objectKey || !uploadKey) {
            return {
                statusCode: 400,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    error: 'Missing required parameters: bucketKey, objectKey, uploadKey' 
                })
            };
        }

        const accessToken = await getInternalToken();

        // Complete the signed S3 upload
        const completeResponse = await fetch(
            `https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects/${encodeURIComponent(objectKey)}/signeds3upload`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    uploadKey: uploadKey
                })
            }
        );

        if (!completeResponse.ok) {
            const errorText = await completeResponse.text();
            throw new Error(`Failed to complete upload: ${completeResponse.status} - ${errorText}`);
        }

        const completeData = await completeResponse.json();
        
        // Get the object details
        const objectResponse = await fetch(
            `https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects/${encodeURIComponent(objectKey)}/details`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );

        if (!objectResponse.ok) {
            throw new Error(`Failed to get object details: ${objectResponse.status}`);
        }

        const objectData = await objectResponse.json();
        
        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                objectId: objectData.objectId,
                objectKey: objectData.objectKey,
                size: objectData.size,
                location: objectData.location,
                bucketKey: bucketKey,
                urn: Buffer.from(objectData.objectId).toString('base64').replace(/=/g, '')
            })
        };

    } catch (error) {
        console.error('Upload completion error:', error);
        
        return {
            statusCode: 500,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: 'Failed to complete upload',
                details: error.message
            })
        };
    }
};
