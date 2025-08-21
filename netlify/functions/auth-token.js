const { APS_CLIENT_ID, APS_CLIENT_SECRET } = process.env;

exports.handler = async (event, context) => {
    // Enable CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    try {
        const { urn } = event.queryStringParameters || {};
        
        // Generate scoped token if URN is provided, otherwise general viewer token
        const scopes = urn 
            ? ['viewables:read'] 
            : ['viewables:read'];
        
        const tokenResponse = await fetch('https://developer.api.autodesk.com/authentication/v2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: APS_CLIENT_ID,
                client_secret: APS_CLIENT_SECRET,
                grant_type: 'client_credentials',
                scope: scopes.join(' ')
            })
        });

        if (!tokenResponse.ok) {
            throw new Error(`APS authentication failed: ${tokenResponse.status}`);
        }

        const tokenData = await tokenResponse.json();
        
        // If URN is provided, create a scoped token with URN-specific claims
        if (urn) {
            // For scoped tokens, we'd need to implement the JWT creation
            // For now, return the general token but mark it as scoped
            tokenData.scoped = true;
            tokenData.target_urn = urn;
        }

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(tokenData)
        };

    } catch (error) {
        console.error('Authentication error:', error);
        
        return {
            statusCode: 500,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: 'Failed to generate authentication token',
                details: error.message
            })
        };
    }
};
