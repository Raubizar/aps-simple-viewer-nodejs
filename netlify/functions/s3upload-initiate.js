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
            scope: 'data:read data:write bucket:read'
        })
    });

    if (!response.ok) {
        throw new Error(`APS authentication failed: ${response.status}`);
    }

    const data = await response.json();
    return data.access_token;
}

// Helper function to check bucket accessibility
async function checkBucketAccess(accessToken) {
    const response = await fetch(`https://developer.api.autodesk.com/oss/v2/buckets/${APS_BUCKET}`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });
    
    if (response.status === 404) {
        throw new Error(`Bucket '${APS_BUCKET}' does not exist. Please create it manually in APS Object Storage.`);
    } else if (!response.ok) {
        throw new Error(`Bucket access failed: ${response.status}`);
    }
    
    return true;
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
        
        // Check if bucket is accessible
        try {
            await checkBucketAccess(accessToken);
        } catch (error) {
            console.error('Bucket access error:', error);
            if (error.message.includes('Failed to create bucket')) {
                throw new Error(`Bucket '${APS_BUCKET}' does not exist. Please create it manually in APS Object Storage before uploading files.`);
            } else {
                throw new Error(`Bucket '${APS_BUCKET}' is not accessible. Please ensure it exists and your app has access to it.`);
            }
        }

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
