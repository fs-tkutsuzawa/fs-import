export const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

console.log(
  '[API Config] REACT_APP_API_BASE_URL:',
  process.env.REACT_APP_API_BASE_URL
);
console.log('[API Config] API_BASE_URL:', API_BASE_URL);

export const getApiUrl = (endpoint: string): string => {
  const baseUrl = API_BASE_URL;
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const fullUrl = `${baseUrl}${cleanEndpoint}`;
  console.log('[API Config] getApiUrl:', endpoint, '->', fullUrl);
  return fullUrl;
};
