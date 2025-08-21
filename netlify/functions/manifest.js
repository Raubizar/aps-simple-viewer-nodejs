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
            scope: 'data:read'
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

        const { urn } = event.queryStringParameters || {};
        
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

        // Get the manifest
        const manifestResponse = await fetch(
            `https://developer.api.autodesk.com/modelderivative/v2/designdata/${urn}/manifest`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );

        if (!manifestResponse.ok) {
            if (manifestResponse.status === 404) {
                return {
                    statusCode: 200,
                    headers: {
                        ...headers,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        urn: urn,
                        status: 'n/a',
                        progress: '0%',
                        message: 'Manifest not found - translation may not have started'
                    })
                };
            }
            throw new Error(`Failed to get manifest: ${manifestResponse.status}`);
        }

        const manifestData = await manifestResponse.json();
        
        // Extract status and progress information
        let status = manifestData.status || 'unknown';
        let progress = '0%';
        let messages = [];
        let derivatives = [];

        if (manifestData.derivatives && manifestData.derivatives.length > 0) {
            const mainDerivative = manifestData.derivatives[0];
            status = mainDerivative.status || status;
            progress = mainDerivative.progress || '0%';
            
            // Collect messages from all derivatives
            manifestData.derivatives.forEach(derivative => {
                if (derivative.messages) {
                    messages = messages.concat(derivative.messages);
                }
                if (derivative.children) {
                    derivative.children.forEach(child => {
                        if (child.messages) {
                            messages = messages.concat(child.messages);
                        }
                    });
                }
            });

            // Extract derivative information
            derivatives = manifestData.derivatives.map(derivative => ({
                guid: derivative.guid,
                type: derivative.type,
                status: derivative.status,
                progress: derivative.progress,
                viewable: derivative.viewable
            }));
        }

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                urn: urn,
                status: status,
                progress: progress,
                messages: messages,
                derivatives: derivatives,
                timestamp: new Date().toISOString()
            })
        };

    } catch (error) {
        console.error('Manifest error:', error);
        
        return {
            statusCode: 500,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: 'Failed to get manifest',
                details: error.message
            })
        };
    }
};
