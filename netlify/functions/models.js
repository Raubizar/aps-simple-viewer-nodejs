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
            scope: 'data:read bucket:read'
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
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    try {
        if (event.httpMethod !== 'GET') {
            return {
                statusCode: 405,
                headers,
                body: JSON.stringify({ error: 'Method not allowed' })
            };
        }

        const accessToken = await getInternalToken();
        await ensureBucketExists(accessToken);

        // Get objects from the bucket
        let allObjects = [];
        let startAt = null;
        const limit = 64;

        do {
            let url = `https://developer.api.autodesk.com/oss/v2/buckets/${APS_BUCKET}/objects?limit=${limit}`;
            if (startAt) {
                url += `&startAt=${startAt}`;
            }

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to get objects: ${response.status}`);
            }

            const data = await response.json();
            allObjects = allObjects.concat(data.items || []);
            
            // Check if there are more objects
            startAt = data.next ? new URL(data.next).searchParams.get('startAt') : null;
            
        } while (startAt);

        // Format the response
        const models = allObjects.map(obj => ({
            name: obj.objectKey,
            urn: Buffer.from(obj.objectId).toString('base64').replace(/=/g, ''),
            size: obj.size,
            created: obj.createdDate,
            modified: obj.modifiedDate
        }));

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(models)
        };

    } catch (error) {
        console.error('Models listing error:', error);
        
        return {
            statusCode: 500,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: 'Failed to list models',
                details: error.message
            })
        };
    }
};
