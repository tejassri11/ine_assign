export const fetchApi = async (endpoint, options = {}) => {
  const url = `/api${endpoint}`;
  
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const finalOptions = {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...options.headers,
    },
  };

  if (options.body && typeof options.body === 'object') {
    finalOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, finalOptions);
  
  // We parse the JSON for successful responses, but also for errors if the server sends JSON errors
  let data;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    let errorMessage = 'API Error';
    if (data?.error) errorMessage = data.error;
    else if (data?.message) errorMessage = data.message;
    else if (typeof data === 'string') errorMessage = data;
    
    const error = new Error(errorMessage);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
};

// Endpoints
export const searchProducts = (query) => fetchApi(`/products/search?q=${encodeURIComponent(query)}`);
export const getTrackedProducts = (activeOnly = true) => fetchApi(`/products/tracked?activeOnly=${activeOnly}`);
export const getProductDetails = (id) => fetchApi(`/products/${id}`);
export const trackProduct = (productId) => fetchApi(`/products/track`, { method: 'POST', body: { productId } });
export const untrackProduct = (id) => fetchApi(`/products/${id}/track`, { method: 'DELETE' });
export const scrapeProductNow = (id) => fetchApi(`/products/${id}/scrape`, { method: 'POST' });
export const getProductHistory = (id) => fetchApi(`/products/${id}/history`);
export const getProductLogs = (id) => fetchApi(`/products/${id}/logs`);
export const getCatalog = (page = 1, pageSize = 200) => fetchApi(`/products/catalog?page=${page}&pageSize=${pageSize}`);
