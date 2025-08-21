import { initViewer, loadModel } from './viewer.js';

// Global state
let currentViewer = null;
let currentModel = null;
let uploadInProgress = false;

// Initialize the application
async function initApp() {
    try {
        currentViewer = await initViewer(document.getElementById('preview'));
        setupModelSelection();
        setupModelUpload();
        setupModelTranslation();
        setupModelSummary();
        
        // Check for URN in URL hash
        const urn = window.location.hash?.substring(1);
        if (urn) {
            selectModel(urn);
        }
    } catch (error) {
        console.error('Failed to initialize app:', error);
        showNotification('Failed to initialize viewer. Please refresh the page.');
    }
}

// Setup model selection dropdown
async function setupModelSelection() {
    const dropdown = document.getElementById('models');
    
    try {
        const response = await fetch('/.netlify/functions/models');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        
        const models = await response.json();
        
        dropdown.innerHTML = '<option value="">Select a model...</option>';
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.urn;
            option.textContent = model.name;
            dropdown.appendChild(option);
        });
        
        dropdown.onchange = () => {
            if (dropdown.value) {
                selectModel(dropdown.value);
            }
        };
        
    } catch (error) {
        console.error('Failed to load models:', error);
        showNotification('Failed to load models. Please try again.');
    }
}

// Setup file upload functionality
function setupModelUpload() {
    const uploadBtn = document.getElementById('upload');
    const fileInput = document.getElementById('input');
    
    uploadBtn.onclick = () => fileInput.click();
    
    fileInput.onchange = async () => {
        const file = fileInput.files[0];
        if (!file) return;
        
        // Validate file type
        const allowedExtensions = ['.rvt', '.dwg', '.ifc', '.nwd', '.3ds', '.obj', '.stl', '.zip'];
        const fileExt = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
        
        if (!allowedExtensions.includes(fileExt)) {
            showNotification(`File type ${fileExt} is not supported. Please upload a supported file type.`);
            return;
        }
        
        await uploadFile(file);
    };
}

// Upload file using direct-to-S3 approach
async function uploadFile(file) {
    if (uploadInProgress) return;
    
    uploadInProgress = true;
    const uploadBtn = document.getElementById('upload');
    uploadBtn.disabled = true;
    
    try {
        showNotification(`Initiating upload for ${file.name}...`);
        
        // Step 1: Initiate upload
        const initiateResponse = await fetch('/.netlify/functions/s3upload-initiate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                bucketKey: 'default-bucket', // Function will use APS_BUCKET from Netlify env vars
                objectKey: file.name,
                size: file.size
            })
        });
        
        if (!initiateResponse.ok) {
            throw new Error(`Upload initiation failed: ${await initiateResponse.text()}`);
        }
        
        const uploadData = await initiateResponse.json();
        
        showNotification(`Uploading ${file.name} in ${uploadData.numParts} parts...`);
        
        // Step 2: Upload file parts directly to S3
        const uploadPromises = [];
        
        if (uploadData.numParts === 1) {
            // Single part upload
            const response = await fetch(uploadData.urls[0], {
                method: 'PUT',
                body: file
            });
            
            if (!response.ok) {
                throw new Error(`Upload failed: ${response.status}`);
            }
        } else {
            // Multipart upload
            for (let i = 0; i < uploadData.numParts; i++) {
                const start = i * uploadData.partSize;
                const end = Math.min(start + uploadData.partSize, file.size);
                const chunk = file.slice(start, end);
                
                const uploadPromise = fetch(uploadData.urls[i], {
                    method: 'PUT',
                    body: chunk
                });
                
                uploadPromises.push(uploadPromise);
            }
            
            await Promise.all(uploadPromises);
        }
        
        showNotification(`Finalizing upload for ${file.name}...`);
        
        // Step 3: Complete upload
        const completeResponse = await fetch('/.netlify/functions/s3upload-complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                bucketKey: 'default-bucket', // Function will use APS_BUCKET from Netlify env vars
                objectKey: file.name,
                uploadKey: uploadData.uploadKey
            })
        });
        
        if (!completeResponse.ok) {
            throw new Error(`Upload completion failed: ${await completeResponse.text()}`);
        }
        
        const completeData = await completeResponse.json();
        
        showNotification(`Upload completed! Starting translation...`);
        
        // Step 4: Start translation
        const translateResponse = await fetch('/.netlify/functions/translate-job', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                urn: completeData.urn,
                rootFilename: file.name.endsWith('.zip') ? prompt('Enter main file name from ZIP:') : undefined
            })
        });
        
        if (!translateResponse.ok) {
            throw new Error(`Translation start failed: ${await translateResponse.text()}`);
        }
        
        const translateData = await translateResponse.json();
        
        showNotification(`Translation started for ${file.name}. URN: ${completeData.urn}`);
        
        // Refresh model list and select the new model
        await setupModelSelection();
        selectModel(completeData.urn);
        
    } catch (error) {
        console.error('Upload error:', error);
        showNotification(`Upload failed: ${error.message}`);
    } finally {
        uploadInProgress = false;
        uploadBtn.disabled = false;
        fileInput.value = '';
    }
}

// Setup model translation functionality
function setupModelTranslation() {
    const translateBtn = document.getElementById('translate');
    
    translateBtn.onclick = async () => {
        if (!currentModel) return;
        
        try {
            translateBtn.disabled = true;
            showNotification(`Starting translation for ${currentModel.name}...`);
            
            const response = await fetch('/.netlify/functions/translate-job', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ urn: currentModel.urn })
            });
            
            if (!response.ok) {
                throw new Error(`Translation failed: ${await response.text()}`);
            }
            
            const data = await response.json();
            showNotification(`Translation started successfully. Job ID: ${data.jobId}`);
            
            // Start polling for status
            pollTranslationStatus(currentModel.urn);
            
        } catch (error) {
            console.error('Translation error:', error);
            showNotification(`Translation failed: ${error.message}`);
        } finally {
            translateBtn.disabled = false;
        }
    };
}

// Setup model summary functionality
function setupModelSummary() {
    const summaryBtn = document.getElementById('summary');
    const closeBtn = document.getElementById('close-summary');
    const panel = document.getElementById('summary-panel');
    
    summaryBtn.onclick = () => {
        if (currentModel) {
            generateModelSummary();
            panel.style.display = 'block';
        }
    };
    
    closeBtn.onclick = () => {
        panel.style.display = 'none';
    };
}

// Generate model summary with statistics
async function generateModelSummary() {
    if (!currentViewer || !currentModel) return;
    
    try {
        const statsDiv = document.getElementById('summary-stats');
        const categoriesDiv = document.getElementById('summary-categories');
        
        // Get model statistics
        const tree = currentViewer.model.getObjectTree();
        const rootId = tree.getRootId();
        
        // Get properties for all objects
        const objectIds = [];
        const collectIds = (nodeId) => {
            objectIds.push(nodeId);
            const children = tree.getChildren(nodeId);
            children.forEach(childId => collectIds(childId));
        };
        collectIds(rootId);
        
        // Get bulk properties
        const properties = await currentViewer.getBulkProperties(objectIds, ['Category', 'Area', 'Volume', 'Length']);
        
        // Group by category
        const categories = {};
        properties.forEach(prop => {
            const category = prop.properties?.Category || 'Unknown';
            if (!categories[category]) {
                categories[category] = { count: 0, area: 0, volume: 0, length: 0 };
            }
            categories[category].count++;
            
            if (prop.properties?.Area) categories[category].area += prop.properties.Area;
            if (prop.properties?.Volume) categories[category].volume += prop.properties.Volume;
            if (prop.properties?.Length) categories[category].length += prop.properties.Length;
        });
        
        // Display statistics
        statsDiv.innerHTML = `
            <h4>Model Statistics</h4>
            <p><strong>Total Objects:</strong> ${objectIds.length}</p>
            <p><strong>Categories:</strong> ${Object.keys(categories).length}</p>
        `;
        
        // Display categories
        categoriesDiv.innerHTML = '<h4>Categories</h4>';
        Object.entries(categories).forEach(([category, data]) => {
            const div = document.createElement('div');
            div.className = 'category-item';
            div.innerHTML = `
                <strong>${category}</strong><br>
                Count: ${data.count} | 
                Area: ${data.area.toFixed(2)} | 
                Volume: ${data.volume.toFixed(2)} | 
                Length: ${data.length.toFixed(2)}
            `;
            div.onclick = () => isolateCategory(category);
            categoriesDiv.appendChild(div);
        });
        
    } catch (error) {
        console.error('Summary generation error:', error);
        document.getElementById('summary-stats').innerHTML = '<p class="error-message">Failed to generate summary</p>';
    }
}

// Isolate objects by category
function isolateCategory(category) {
    if (!currentViewer || !currentModel) return;
    
    try {
        const tree = currentViewer.model.getObjectTree();
        const rootId = tree.getRootId();
        
        // Find all objects in the category
        const categoryObjects = [];
        const findCategoryObjects = (nodeId) => {
            const children = tree.getChildren(nodeId);
            children.forEach(childId => {
                currentViewer.getProperties(childId, (props) => {
                    if (props.properties?.Category === category) {
                        categoryObjects.push(childId);
                    }
                });
                findCategoryObjects(childId);
            });
        };
        findCategoryObjects(rootId);
        
        // Isolate the category
        currentViewer.isolate(categoryObjects);
        
    } catch (error) {
        console.error('Category isolation error:', error);
    }
}

// Select and load a model
async function selectModel(urn) {
    if (currentModel && currentModel.urn === urn) return;
    
    try {
        currentModel = { urn };
        window.location.hash = urn;
        
        // Check translation status
        const status = await checkTranslationStatus(urn);
        
        if (status.status === 'success') {
            await loadModel(currentViewer, urn);
            showModelControls(true);
        } else if (status.status === 'inprogress') {
            showNotification(`Model is being translated (${status.progress})...`);
            pollTranslationStatus(urn);
        } else if (status.status === 'failed') {
            showNotification(`Translation failed. Please try again.`);
            showModelControls(false);
        } else {
            showNotification(`Model needs translation. Click Translate to start.`);
            showModelControls(false);
        }
        
    } catch (error) {
        console.error('Model selection error:', error);
        showNotification(`Failed to load model: ${error.message}`);
    }
}

// Check translation status
async function checkTranslationStatus(urn) {
    try {
        const response = await fetch(`/.netlify/functions/manifest?urn=${urn}`);
        if (!response.ok) {
            throw new Error(`Status check failed: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Status check error:', error);
        return { status: 'unknown', progress: '0%' };
    }
}

// Poll translation status
function pollTranslationStatus(urn) {
    const pollInterval = setInterval(async () => {
        try {
            const status = await checkTranslationStatus(urn);
            
            if (status.status === 'success') {
                clearInterval(pollInterval);
                showNotification('Translation completed! Loading model...');
                await loadModel(currentViewer, urn);
                showModelControls(true);
            } else if (status.status === 'failed') {
                clearInterval(pollInterval);
                showNotification('Translation failed. Please try again.');
                showModelControls(false);
            } else if (status.status === 'inprogress') {
                showNotification(`Translation in progress: ${status.progress}`);
            }
            
        } catch (error) {
            console.error('Polling error:', error);
            clearInterval(pollInterval);
        }
    }, 5000); // Poll every 5 seconds
}

// Show/hide model controls
function showModelControls(show) {
    const translateBtn = document.getElementById('translate');
    const summaryBtn = document.getElementById('summary');
    
    translateBtn.style.display = show ? 'inline-block' : 'none';
    summaryBtn.style.display = show ? 'inline-block' : 'none';
}

// Show notification
function showNotification(message) {
    const overlay = document.getElementById('overlay');
    overlay.innerHTML = `<div class="notification">${message}</div>`;
    overlay.style.display = 'flex';
}

// Clear notification
function clearNotification() {
    const overlay = document.getElementById('overlay');
    overlay.style.display = 'none';
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);
