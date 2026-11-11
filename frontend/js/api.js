/**
 * SYNQ API-клиент. Все данные интерфейса приходят только отсюда — из REST API.
 *
 * JWT хранится в localStorage (учебный проект). Риск: при XSS скрипт злоумышленника
 * сможет прочитать токен. Снижение риска: строгая CSP (helmet, без inline-скриптов),
 * отсутствие innerHTML с пользовательскими данными, короткий срок жизни токена.
 * Секреты сервера в браузер не попадают никогда.
 */
const TOKEN_KEY = 'synq.token';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const tokenStore = {
  get() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* приватный режим — токен живёт до перезагрузки */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* noop */
    }
  },
};

function buildQuery(params = {}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') qs.set(key, value);
  }
  const str = qs.toString();
  return str ? `?${str}` : '';
}

export async function request(path, { method = 'GET', body, query, form } = {}) {
  const headers = { Accept: 'application/json' };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (form) {
    payload = form; // multipart/form-data: заголовок с boundary выставит браузер
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`/api${path}${buildQuery(query)}`, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Нет соединения с сервером. Проверьте, что API запущен.');
  }

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    const err = json?.error ?? {};
    if (res.status === 401 && token && path !== '/auth/login') {
      tokenStore.clear();
      window.dispatchEvent(new CustomEvent('synq:logout'));
    }
    throw new ApiError(res.status, err.code ?? 'HTTP_ERROR', err.message ?? `Ошибка ${res.status}`, err.details);
  }
  return json;
}

const get = (path, query) => request(path, { query });

export const api = {
  // Auth
  register: (data) => request('/auth/register', { method: 'POST', body: data }),
  login: (data) => request('/auth/login', { method: 'POST', body: data }),
  me: () => get('/auth/me'),

  // Users
  updateMe: (data) => request('/users/me', { method: 'PATCH', body: data }),
  users: (query) => get('/users', query),
  user: (id) => get(`/users/${id}`),
  setRole: (id, role) => request(`/users/${id}/role`, { method: 'PATCH', body: { role } }),

  // Catalog
  products: (query) => get('/products', query),
  product: (id) => get(`/products/${id}`),
  createProduct: (data) => request('/products', { method: 'POST', body: data }),
  updateProduct: (id, data) => request(`/products/${id}`, { method: 'PATCH', body: data }),
  deleteProduct: (id) => request(`/products/${id}`, { method: 'DELETE' }),
  bulkDiscount: (data) => request('/products/discounts', { method: 'POST', body: data }),
  clearDiscounts: (categoryId) => request('/products/discounts', { method: 'DELETE', query: { categoryId } }),

  categories: () => get('/categories'),
  brands: () => get('/brands'),
  popular: (limit = 8) => get('/products/popular', { limit }),
  registerView: (id) => request(`/products/${id}/view`, { method: 'POST' }),
  reviews: (query) => get('/reviews', query),
  productReviews: (id, query) => get(`/products/${id}/reviews`, query),
  myReview: (id) => get(`/products/${id}/reviews/me`),
  createReview: (id, data) => request(`/products/${id}/reviews`, { method: 'POST', body: data }),
  updateReview: (id, data) => request(`/reviews/${id}`, { method: 'PATCH', body: data }),
  deleteReview: (id) => request(`/reviews/${id}`, { method: 'DELETE' }),
  category: (id) => get(`/categories/${id}`),
  categoryProducts: (id, query) => get(`/categories/${id}/products`, query),
  createCategory: (data) => request('/categories', { method: 'POST', body: data }),
  updateCategory: (id, data) => request(`/categories/${id}`, { method: 'PATCH', body: data }),
  deleteCategory: (id) => request(`/categories/${id}`, { method: 'DELETE' }),

  // Orders
  createOrder: (productId) => request('/orders', { method: 'POST', body: { productId } }),
  myOrders: (query) => get('/orders/my', query),
  orders: (query) => get('/orders', query),
  order: (id) => get(`/orders/${id}`),
  setOrderStatus: (id, status) => request(`/orders/${id}/status`, { method: 'PATCH', body: { status } }),
  download: (id) => get(`/orders/${id}/download`),
  payOrder: (id, card) => request(`/orders/${id}/pay`, { method: 'POST', body: card }),

  // Uploads
  uploadImage: (productId, file) => {
    const form = new FormData();
    form.append('productId', productId);
    form.append('file', file);
    return request('/uploads/product-image', { method: 'POST', form });
  },
  uploadFile: (productId, file) => {
    const form = new FormData();
    form.append('productId', productId);
    form.append('file', file);
    return request('/uploads/product-file', { method: 'POST', form });
  },
  deleteImage: (productId) => request(`/uploads/product-image/${productId}`, { method: 'DELETE' }),
  deleteFile: (productId) => request(`/uploads/product-file/${productId}`, { method: 'DELETE' }),

  // Stats
  stats: () => get('/stats'),
  health: () => get('/health'),
};
