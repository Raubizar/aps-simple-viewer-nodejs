const { APS_CLIENT_ID, APS_CLIENT_SECRET, APS_BUCKET } = process.env;

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
            scope: 'data:read data:write bucket:read bucket:create'
        })
    });

    if (!response.ok) {
        throw new Error(`APS authentication failed: ${response.status}`);
    }

    const data = await response.json();
    return data.access_token;
}

// Helper function to ensure bucket exists
async function ensureBucketExists(accessToken) {
    try {
        const response = await fetch(`https://developer.api.autodesk.com/oss/v2/buckets/${APS_BUCKET}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (response.status === 404) {
            // Create bucket if it doesn't exist
            const createResponse = await fetch('https://developer.api.autodesk.com/oss/v2/buckets', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/vnd.api+json'
                },
                body: JSON.stringify({
                    bucketKey: APS_BUCKET,
                    policyKey: 'persistent'
                })
            });

            if (!createResponse.ok) {
                throw new Error(`Failed to create bucket: ${createResponse.status}`);
            }
        } else if (!response.ok) {
            throw new Error(`Bucket check failed: ${response.status}`);
        }
    } catch (error) {
        console.error('Bucket operation error:', error);
        throw error;
    }
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

        const { bucketKey, objectKey, size } = JSON.parse(event.body || '{}');
        
        if (!bucketKey || !objectKey || !size) {
            return {
                statusCode: 400,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    error: 'Missing required parameters: bucketKey, objectKey, size' 
                })
            };
        }

        const accessToken = await getInternalToken();
        await ensureBucketExists(accessToken);

        // Determine if multipart upload is needed (≥100 MB)
        const useMultipart = size >= 100 * 1024 * 1024; // 100 MB
        const partSize = 16 * 1024 * 1024; // 16 MB per part
        const numParts = useMultipart ? Math.ceil(size / partSize) : 1;
        const maxPartsPerRequest = 25;

        if (useMultipart && numParts > maxPartsPerRequest) {
            return {
                statusCode: 400,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    error: `File too large. Maximum supported size: ${maxPartsPerRequest * partSize / (1024 * 1024)} MB` 
                })
            };
        }

        // Initiate signed S3 upload
        const uploadResponse = await fetch(
            `https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects/${encodeURIComponent(objectKey)}/signeds3upload?firstPart=1&parts=${numParts}`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );

        if (!uploadResponse.ok) {
            throw new Error(`Failed to initiate upload: ${uploadResponse.status}`);
        }

        const uploadData = await uploadResponse.json();
        
        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                uploadKey: uploadData.uploadKey,
                urls: uploadData.urls,
                partNumbers: uploadData.partNumbers,
                size: size,
                partSize: partSize,
                numParts: numParts
            })
        };

    } catch (error) {
        console.error('Upload initiation error:', error);
        
        return {
            statusCode: 500,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: 'Failed to initiate upload',
                details: error.message
            })
        };
    }
};
