# Freesound API Integration Notes

## Authentication
- Token-based authentication: Add API key as `token` GET parameter or Authorization header
- Example: `curl "https://freesound.org/apiv2/search/text/?query=piano&token=YOUR_API_KEY"`
- Or: `curl -H "Authorization: Token YOUR_API_KEY" "https://freesound.org/apiv2/search/text/?query=piano"`

## Search Endpoint
- URL: `https://freesound.org/apiv2/search/text/`
- Parameters: query, filter, sort, page, page_size

## Sound Resource
- Get sound info: `https://freesound.org/apiv2/sounds/{sound_id}/`
- Preview URLs included in response

## Key Points
- Requires API key from https://freesound.org/apiv2/apply
- Free for non-commercial use
- Returns JSON with sound metadata and preview URLs
