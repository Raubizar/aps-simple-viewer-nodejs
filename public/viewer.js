// APS Viewer integration functions

// Get access token for viewer
async function getAccessToken(callback) {
    try {
        const response = await fetch('/.netlify/functions/auth-token');
        if (!response.ok) {
            throw new Error(`Failed to get token: ${response.status}`);
        }
        
        const tokenData = await response.json();
        callback(tokenData.access_token, tokenData.expires_in);
        
    } catch (error) {
        console.error('Token retrieval error:', error);
        alert('Could not obtain access token. Please check your APS credentials.');
    }
}

// Initialize the APS viewer
export function initViewer(container) {
    return new Promise((resolve, reject) => {
        // Check if Autodesk viewer is available
        if (typeof Autodesk === 'undefined') {
            reject(new Error('Autodesk Viewer not loaded'));
            return;
        }

        // Initialize the viewer
        Autodesk.Viewing.Initializer({
            env: 'AutodeskProduction',
            getAccessToken: getAccessToken
        }, () => {
            try {
                // Create viewer configuration
                const config = {
                    extensions: ['Autodesk.DocumentBrowser']
                };

                // Create the viewer instance
                const viewer = new Autodesk.Viewing.GuiViewer3D(container, config);
                
                // Start the viewer
                viewer.start();
                
                // Set theme
                viewer.setTheme('light-theme');
                
                // Add error handling
                viewer.addEventListener(Autodesk.Viewing.ERROR_EVENT, (event) => {
                    console.error('Viewer error:', event);
                });
                
                // Add geometry loaded event
                viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, () => {
                    console.log('Model geometry loaded successfully');
                });
                
                resolve(viewer);
                
            } catch (error) {
                reject(error);
            }
        });
    });
}

// Load a model into the viewer
export function loadModel(viewer, urn) {
    return new Promise((resolve, reject) => {
        if (!viewer || !urn) {
            reject(new Error('Viewer or URN not provided'));
            return;
        }

        try {
            // Document load success callback
            function onDocumentLoadSuccess(doc) {
                try {
                    // Get the default viewable
                    const defaultViewable = doc.getRoot().getDefaultGeometry();
                    
                    if (!defaultViewable) {
                        reject(new Error('No default viewable found in document'));
                        return;
                    }
                    
                    // Load the viewable
                    viewer.loadDocumentNode(doc, defaultViewable).then(() => {
                        console.log('Model loaded successfully');
                        
                        // Set default view settings
                        viewer.setLightPreset(0);
                        viewer.fitToView();
                        
                        resolve(viewer);
                    }).catch(reject);
                    
                } catch (error) {
                    reject(error);
                }
            }

            // Document load failure callback
            function onDocumentLoadFailure(code, message, errors) {
                console.error('Document load failed:', { code, message, errors });
                reject(new Error(`Failed to load document: ${message}`));
            }

            // Load the document
            Autodesk.Viewing.Document.load(
                'urn:' + urn,
                onDocumentLoadSuccess,
                onDocumentLoadFailure
            );
            
        } catch (error) {
            reject(error);
        }
    });
}

// Utility function to get viewer instance
export function getViewer() {
    return window.currentViewer;
}

// Utility function to get current model
export function getCurrentModel() {
    return window.currentModel;
}
