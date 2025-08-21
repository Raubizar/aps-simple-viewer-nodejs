# APS Simple Viewer - Netlify Deployment

This is the Netlify serverless version of the APS Simple Viewer, featuring direct-to-S3 uploads, scoped tokens, and modern web architecture.

## 🚀 **Quick Deploy to Netlify**

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/yourusername/aps-simple-viewer-nodejs)

## 📁 **Project Structure**

```
aps-simple-viewer-nodejs/
├── netlify/
│   ├── functions/
│   │   ├── auth-token.js          # Authentication & scoped tokens
│   │   ├── s3upload-initiate.js   # Direct-to-S3 upload initiation
│   │   ├── s3upload-complete.js   # Upload completion
│   │   ├── translate-job.js       # SVF2 translation jobs
│   │   ├── manifest.js            # Translation status & manifest
│   │   └── models.js              # Model listing
│   └── netlify.toml              # Netlify configuration
├── public/                        # Static frontend (CDN)
│   ├── index.html                # Main application
│   ├── app.css                   # Styling
│   ├── app.js                    # Main application logic
│   └── viewer.js                 # APS viewer integration
└── README.md                     # This file
```

## 🔧 **Setup Requirements**

### **1. APS Credentials**
- **APS Client ID** - From [APS Developer Portal](https://forge.autodesk.com/en/docs/oauth/v2/tutorials/create-app/)
- **APS Client Secret** - From your APS application
- **APS Bucket** - Optional, defaults to `{client-id}-basic-app`

### **2. Netlify Account**
- Free Netlify account for hosting
- Git repository (GitHub, GitLab, Bitbucket)

## 🚀 **Deployment Steps**

### **Option 1: Deploy from Git (Recommended)**

1. **Fork/Clone this repository**
   ```bash
   git clone https://github.com/yourusername/aps-simple-viewer-nodejs
   cd aps-simple-viewer-nodejs
   ```

2. **Push to your Git repository**
   ```bash
   git add .
   git commit -m "Initial Netlify deployment"
   git push origin main
   ```

3. **Connect to Netlify**
   - Go to [Netlify](https://app.netlify.com)
   - Click "New site from Git"
   - Choose your repository
   - Set build settings:
     - **Build command**: Leave empty (no build needed)
     - **Publish directory**: `public`

4. **Configure Environment Variables**
   - Go to Site settings → Environment variables
   - Add these variables:
     ```
     APS_CLIENT_ID=your_client_id_here
     APS_CLIENT_SECRET=your_client_secret_here
     APS_BUCKET=your_bucket_name_here (optional)
     ```

5. **Deploy**
   - Click "Deploy site"
   - Wait for deployment to complete

### **Option 2: Manual Deploy**

1. **Create Netlify site**
   - Go to [Netlify](https://app.netlify.com)
   - Drag and drop the `public` folder

2. **Upload Functions**
   - Go to Functions tab
   - Upload each function from `netlify/functions/`

3. **Set Environment Variables**
   - Same as Option 1

## 🔑 **Environment Variables**

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `APS_CLIENT_ID` | ✅ | Your APS application client ID | - |
| `APS_CLIENT_SECRET` | ✅ | Your APS application client secret | - |
| `APS_BUCKET` | ❌ | Custom bucket name | `{client-id}-basic-app` |

## 🌐 **API Endpoints**

### **Authentication**
- `GET /.netlify/functions/auth-token` - Get viewer access token
- `GET /.netlify/functions/auth-token?urn={urn}` - Get scoped token for specific model

### **File Management**
- `POST /.netlify/functions/s3upload-initiate` - Start direct-to-S3 upload
- `POST /.netlify/functions/s3upload-complete` - Complete upload
- `GET /.netlify/functions/models` - List available models

### **Translation**
- `POST /.netlify/functions/translate-job` - Start SVF2 translation
- `GET /.netlify/functions/manifest?urn={urn}` - Check translation status

## 📤 **File Upload Flow**

1. **Initiate Upload** → Get signed S3 URLs
2. **Direct Upload** → Browser uploads to S3 (bypasses Netlify)
3. **Complete Upload** → Finalize in APS OSS
4. **Start Translation** → Convert to SVF2 format
5. **Poll Status** → Monitor translation progress
6. **View Model** → Load in APS viewer

## 🔒 **Security Features**

- **Scoped Tokens**: URN-specific access control
- **Direct-to-S3**: Files never pass through Netlify functions
- **CORS Protection**: Proper cross-origin handling
- **Environment Isolation**: Secrets stored securely

## 📱 **Features**

- ✅ **3D Model Viewer**: Full APS viewer integration
- ✅ **File Upload**: Support for 60+ file formats
- ✅ **Direct-to-S3**: Efficient large file handling
- ✅ **SVF2 Translation**: Modern viewing format
- ✅ **Model Summary**: Statistics and category isolation
- ✅ **Responsive UI**: Mobile-friendly interface
- ✅ **Real-time Status**: Translation progress tracking

## 🚨 **Limitations & Considerations**

### **Netlify Function Limits**
- **Execution Time**: 10 seconds (free) / 26 seconds (paid)
- **Payload Size**: ~6 MB request limit
- **Memory**: 1024 MB per function

### **File Size Support**
- **Small Files** (<100 MB): Single-part upload
- **Large Files** (≥100 MB): Multipart upload (16 MB chunks)
- **Maximum**: No hard limit (S3 supports TB-scale)

### **Supported Formats**
- **CAD**: RVT, DWG, IFC, NWD
- **3D**: 3DS, OBJ, STL
- **Archives**: ZIP (with entry point specification)

## 🐛 **Troubleshooting**

### **Common Issues**

1. **"APS authentication failed"**
   - Check your `APS_CLIENT_ID` and `APS_CLIENT_SECRET`
   - Verify your APS application has the required scopes

2. **"Function execution timeout"**
   - Functions are designed to be fast
   - Check for infinite loops or long-running operations

3. **"CORS error"**
   - Functions include proper CORS headers
   - Check if your domain is allowed

4. **"Upload failed"**
   - Verify file type is supported
   - Check file size isn't too large
   - Ensure APS bucket exists and is accessible

### **Debug Mode**

Enable function logging in Netlify:
1. Go to Functions → Settings
2. Enable "Function logs"
3. Check logs for detailed error information

## 🔄 **Updates & Maintenance**

### **Updating Functions**
1. Modify function files locally
2. Commit and push to Git
3. Netlify automatically redeploys

### **Environment Variables**
- Changes require manual redeploy
- No downtime during updates

## 📚 **Resources**

- [APS Documentation](https://aps.autodesk.com/)
- [Netlify Functions](https://docs.netlify.com/functions/overview/)
- [APS Direct-to-S3](https://aps.autodesk.com/en/docs/oss/v2/developers_guide/advanced_topics/direct-to-s3/)
- [APS Scoped Tokens](https://aps.autodesk.com/en/docs/oauth/v2/developers_guide/scoped_tokens/)

## 📄 **License**

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 **Support**

- **APS Issues**: [APS Support](https://forge.autodesk.com/en/support/get-help)
- **Netlify Issues**: [Netlify Support](https://docs.netlify.com/)
- **Code Issues**: Open an issue on GitHub

---

**Ready to deploy?** Click the "Deploy to Netlify" button above or follow the manual deployment steps!
