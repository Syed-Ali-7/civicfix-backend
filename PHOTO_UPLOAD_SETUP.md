# Photo Upload & Reverse Geocoding Setup

## Overview

This document describes the implementation of photo uploads and reverse geocoding (coordinates to address conversion) for the CivicFix application.

## Features Implemented

### 1. Photo Upload
- Users can capture and upload photos when reporting issues
- Photos are stored in `backend/uploads/` directory
- Photos are served statically via `/uploads` endpoint
- Maximum file size: 5MB
- Supported formats: JPEG, JPG, PNG, GIF, WEBP

### 2. Reverse Geocoding
- Automatically converts coordinates (latitude/longitude) to human-readable addresses
- Uses OpenStreetMap Nominatim API (free, no API key required)
- Address is stored in the database with each issue
- Falls back gracefully if geocoding fails

### 3. Address Display
- Address is displayed in the issue report screen
- Address is shown in issue cards instead of raw coordinates
- Falls back to coordinates if address is not available

## Backend Changes

### New Dependencies
- `multer`: File upload handling
- Added to `package.json`

### New Files
- `backend/src/middleware/upload.js`: Multer configuration for file uploads
- `backend/src/utils/geocoding.js`: Reverse geocoding utility

### Modified Files
- `backend/src/models/Issue.js`: Added `address` field
- `backend/src/controllers/issueController.js`: 
  - Handles file uploads
  - Performs reverse geocoding
  - Constructs photo URLs
- `backend/src/routes/issueRoutes.js`: Added multer middleware
- `backend/server.js`: Added static file serving for uploads

### Database Changes
- New column: `address` (TEXT, nullable) in `issues` table
- Existing column: `photo_url` (now stores full URL to uploaded image)

## Frontend Changes

### Modified Files
- `mobile/src/screens/ReportScreen.js`:
  - Uploads actual photos using FormData
  - Displays address after reverse geocoding
  - Shows loading state while fetching address
- `mobile/src/components/IssueCard.js`:
  - Displays address if available
  - Falls back to coordinates if address not available
  - Shows uploaded photos from backend

## Setup Instructions

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Create Uploads Directory
The uploads directory is created automatically when the server starts, but you can create it manually:
```bash
mkdir -p backend/uploads
```

### 3. Database Migration
The database will automatically sync the new `address` field when you restart the server. If you need to manually add it:
```sql
ALTER TABLE issues ADD COLUMN address TEXT;
```

### 4. Start Server
```bash
npm run dev
```

The server will:
- Create the uploads directory if it doesn't exist
- Serve uploaded images from `/uploads` endpoint
- Handle file uploads via multer middleware
- Perform reverse geocoding for new issues

## API Usage

### Creating an Issue with Photo
```javascript
const formData = new FormData();
formData.append('title', 'Pothole on Main Street');
formData.append('description', 'Large pothole causing damage to vehicles');
formData.append('latitude', '40.7128');
formData.append('longitude', '-74.0060');
formData.append('photo', {
  uri: photoUri,
  name: 'photo.jpg',
  type: 'image/jpeg',
});

const response = await fetch('https://your-api-url/api/issues', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
  },
  body: formData,
});
```

### Response
```json
{
  "id": "uuid",
  "title": "Pothole on Main Street",
  "description": "Large pothole causing damage to vehicles",
  "photo_url": "https://your-api-url/uploads/issue-1234567890-123456789.jpg",
  "latitude": "40.7128",
  "longitude": "-74.0060",
  "address": "123 Main Street, New York, NY, USA, 10001",
  "status": "Open",
  "created_at": "2024-01-15T10:30:00.000Z"
}
```

## File Storage

### Location
- Uploaded files are stored in: `backend/uploads/`
- File naming: `issue-{timestamp}-{random}.{extension}`
- Example: `issue-1705321800000-123456789.jpg`

### Serving Files
- Files are served at: `https://your-api-url/uploads/{filename}`
- Static file serving is configured in `server.js`
- Files are accessible via HTTP/HTTPS

## Reverse Geocoding

### Service Used
- **OpenStreetMap Nominatim API**
- Free, no API key required
- Rate limit: 1 request per second (recommended)

### Implementation
- Called automatically when creating an issue
- Uses coordinates to fetch address
- Formats address into readable string
- Falls back gracefully if service is unavailable

### Address Format
The address is formatted as:
```
{street_number} {street_name}, {neighborhood}, {city}, {state}, {country}, {postal_code}
```

Example:
```
123 Main Street, Downtown, New York, New York, United States, 10001
```

## Troubleshooting

### Photo Upload Issues
1. **File too large**: Check file size (max 5MB)
2. **Invalid file type**: Ensure file is JPEG, PNG, GIF, or WEBP
3. **Upload directory permissions**: Ensure `uploads/` directory is writable
4. **Photo URL not accessible**: Check if static file serving is configured correctly

### Reverse Geocoding Issues
1. **No address returned**: Check internet connection
2. **Rate limiting**: OpenStreetMap has rate limits (1 req/sec)
3. **Invalid coordinates**: Ensure latitude/longitude are valid
4. **Service unavailable**: Check OpenStreetMap Nominatim status

### Display Issues
1. **Photo not showing**: Check if photo URL is correct and accessible
2. **Address not showing**: Check if reverse geocoding succeeded
3. **Coordinates showing instead of address**: Address might not be available

## Security Considerations

1. **File Upload Security**:
   - File type validation (only images)
   - File size limits (5MB)
   - Unique filenames to prevent overwrites
   - Files stored outside web root (recommended for production)

2. **Photo URL Security**:
   - URLs are constructed server-side
   - No user input in file paths
   - Static file serving with proper headers

3. **Reverse Geocoding**:
   - No sensitive data sent to external service
   - Graceful fallback if service fails
   - Rate limiting consideration

## Production Considerations

1. **File Storage**:
   - Consider using cloud storage (AWS S3, Cloudinary, etc.)
   - Implement image compression/resizing
   - Set up CDN for faster delivery

2. **Reverse Geocoding**:
   - Consider caching addresses to reduce API calls
   - Use paid geocoding service for higher limits
   - Implement batch geocoding for existing issues

3. **Performance**:
   - Implement image optimization
   - Use thumbnail generation
   - Cache frequently accessed images

## Testing

### Test Photo Upload
1. Capture a photo in the mobile app
2. Submit an issue
3. Verify photo is uploaded and accessible
4. Check photo URL in response

### Test Reverse Geocoding
1. Submit an issue with coordinates
2. Check if address is returned in response
3. Verify address is stored in database
4. Check if address is displayed in UI

### Test Address Display
1. View issue list
2. Verify address is shown (if available)
3. Verify coordinates are shown (if address not available)

## Notes

- The `uploads/` directory is added to `.gitignore` to prevent committing uploaded files
- Photos are served via the same server/domain as the API
- Reverse geocoding happens synchronously during issue creation (may add slight delay)
- Address is optional - issues can be created without address if geocoding fails

