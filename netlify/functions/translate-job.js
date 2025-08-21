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

        const { urn, rootFilename } = JSON.parse(event.body || '{}');
        
        if (!urn) {
            return {
                statusCode: 400,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    error: 'Missing required parameter: urn' 
                })
            };
        }

        const accessToken = await getInternalToken();

        // Start the translation job
        const jobResponse = await fetch('https://developer.api.autodesk.com/modelderivative/v2/designdata/job', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'x-ads-force': 'true' // Force new translation even if one exists
            },
            body: JSON.stringify({
                input: {
                    urn: urn,
                    compressedUrn: !!rootFilename,
                    rootFilename: rootFilename || undefined
                },
                output: {
                    formats: [{
                        type: 'svf2',
                        views: ['2d', '3d'],
                        advanced: {
                            generateMasterViews: true
                        }
                    }]
                }
            })
        });

        if (!jobResponse.ok) {
            const errorText = await jobResponse.text();
            throw new Error(`Failed to start translation job: ${jobResponse.status} - ${errorText}`);
        }

        const jobData = await jobResponse.json();
        
        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                urn: urn,
                jobId: jobData.result,
                status: 'accepted',
                message: 'Translation job started successfully'
            })
        };

    } catch (error) {
        console.error('Translation job error:', error);
        
        return {
            statusCode: 500,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: 'Failed to start translation job',
                details: error.message
            })
        };
    }
};
