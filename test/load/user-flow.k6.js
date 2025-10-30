import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const registrationDuration = new Trend('registration_duration');
const loginDuration = new Trend('login_duration');
const checkoutDuration = new Trend('checkout_duration');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Ramp up to 10 users
    { duration: '1m', target: 50 },   // Ramp up to 50 users
    { duration: '2m', target: 50 },   // Stay at 50 users
    { duration: '30s', target: 0 },   // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% of requests < 500ms
    http_req_failed: ['rate<0.01'], // Error rate < 1%
    errors: ['rate<0.1'],
  },
};

// Base URL - change this to your API URL
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Headers
const headers = {
  'Content-Type': 'application/json',
};

/**
 * Register new user
 */
function register() {
  const email = `load-test-${__VU}-${Date.now()}@example.com`;
  const payload = JSON.stringify({
    email,
    password: 'LoadTest123!',
    fullName: `Load Test User ${__VU}`,
  });

  const res = http.post(`${BASE_URL}/auth/register`, payload, { headers });

  const success = check(res, {
    'register status 201': (r) => r.status === 201,
    'register has user id': (r) => r.json('user.id') !== undefined,
  });

  errorRate.add(!success);
  registrationDuration.add(res.timings.duration);

  return {
    email,
    password: 'LoadTest123!',
    userId: res.json('user.id'),
  };
}

/**
 * Login user
 */
function login(credentials) {
  const payload = JSON.stringify({
    email: credentials.email,
    password: credentials.password,
  });

  const res = http.post(`${BASE_URL}/auth/login`, payload, { headers });

  const success = check(res, {
    'login status 200': (r) => r.status === 200,
    'login has access token': (r) => r.json('accessToken') !== undefined,
  });

  errorRate.add(!success);
  loginDuration.add(res.timings.duration);

  return res.json('accessToken');
}

/**
 * List products
 */
function listProducts() {
  const res = http.get(`${BASE_URL}/products`);

  const success = check(res, {
    'list products status 200': (r) => r.status === 200,
    'list products has data': (r) => Array.isArray(r.json()),
  });

  errorRate.add(!success);

  const products = res.json() || [];
  return products[0]?.id;
}

/**
 * Get product detail
 */
function getProductDetail(productId) {
  if (!productId) return null;

  const res = http.get(`${BASE_URL}/products/${productId}`);

  const success = check(res, {
    'product detail status 200': (r) => r.status === 200,
    'product has id': (r) => r.json('id') !== undefined,
    'product has variants': (r) => Array.isArray(r.json('variants')),
  });

  errorRate.add(!success);

  const product = res.json();
  return product;
}

/**
 * Get cart
 */
function getCart(token) {
  const res = http.get(`${BASE_URL}/cart`, {
    headers: {
      ...headers,
      Authorization: `Bearer ${token}`,
    },
  });

  const success = check(res, {
    'get cart status 200': (r) => r.status === 200,
    'cart has items array': (r) => Array.isArray(r.json('items')),
  });

  errorRate.add(!success);

  return res.json();
}

/**
 * Add item to cart
 */
function addToCart(token, variantId) {
  if (!variantId) return null;

  const payload = JSON.stringify({
    variantId,
    quantity: 2,
  });

  const res = http.post(`${BASE_URL}/cart/items`, payload, {
    headers: {
      ...headers,
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': `load-test-${__VU}-${__ITER}`,
    },
  });

  const success = check(res, {
    'add to cart status 201': (r) => r.status === 201,
    'cart has items': (r) => r.json('totalQuantity') > 0,
  });

  errorRate.add(!success);

  return res.json();
}

/**
 * Create order (checkout)
 */
function createOrder(token, cart) {
  if (!cart || !cart.items || cart.items.length === 0) {
    return null;
  }

  const payload = JSON.stringify({
    cartId: cart.id,
    items: cart.items.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
    })),
    currency: cart.currency || 'IDR',
    subtotalAmount: cart.subtotalAmount,
    shippingAmount: 0,
    discountAmount: 0,
    totalAmount: cart.subtotalAmount,
    paymentMethod: 'MANUAL_TRANSFER',
  });

  const res = http.post(`${BASE_URL}/orders`, payload, {
    headers: {
      ...headers,
      Authorization: `Bearer ${token}`,
    },
  });

  const success = check(res, {
    'create order status 201': (r) => r.status === 201,
    'order has id': (r) => r.json('id') !== undefined,
    'order status is PENDING_PAYMENT': (r) => r.json('status') === 'PENDING_PAYMENT',
  });

  errorRate.add(!success);
  checkoutDuration.add(res.timings.duration);

  return res.json();
}

/**
 * List user orders
 */
function listOrders(token) {
  const res = http.get(`${BASE_URL}/orders`, {
    headers: {
      ...headers,
      Authorization: `Bearer ${token}`,
    },
  });

  const success = check(res, {
    'list orders status 200': (r) => r.status === 200,
    'orders has data': (r) => Array.isArray(r.json('data')),
  });

  errorRate.add(!success);

  return res.json('data');
}

/**
 * Main test scenario
 */
export default function () {
  let token, cart, order;

  // Group 1: Authentication
  group('Authentication', () => {
    const credentials = register();
    sleep(0.5);

    token = login(credentials);
    sleep(0.5);
  });

  // Group 2: Browse Products
  group('Browse Products', () => {
    const productId = listProducts();
    sleep(0.3);

    if (productId) {
      const product = getProductDetail(productId);
      sleep(0.3);

      // Group 3: Shopping Cart (now with actual cart functionality)
      if (product && product.variants && product.variants.length > 0) {
        group('Shopping Cart', () => {
          cart = getCart(token);
          sleep(0.3);

          // Add first variant to cart
          const variantId = product.variants[0].id;
          cart = addToCart(token, variantId);
          sleep(0.3);
        });

        // Group 4: Checkout (only if cart has items)
        if (cart && cart.items && cart.items.length > 0) {
          group('Checkout', () => {
            order = createOrder(token, cart);
            sleep(0.5);

            if (order) {
              listOrders(token);
            }
          });
        }
      }
    }
  });

  // Think time between iterations
  sleep(1);
}

/**
 * Setup function - runs once per VU
 */
export function setup() {
  console.log('Starting load test...');
  console.log(`Target URL: ${BASE_URL}`);

  // Health check
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    throw new Error('Health check failed - is the server running?');
  }

  console.log('Health check passed ✓');
}

/**
 * Teardown function - runs once after all VUs complete
 */
export function teardown(data) {
  console.log('Load test completed!');
}

/**
 * Handle summary - custom output formatting
 */
export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'summary.json': JSON.stringify(data),
  };
}

function textSummary(data, options = {}) {
  const indent = options.indent || '';
  const enableColors = options.enableColors || false;

  let summary = '\n';
  summary += `${indent}✓ checks.........................: ${(data.metrics.checks.values.passes / data.metrics.checks.values.count * 100).toFixed(2)}%\n`;
  summary += `${indent}✗ errors.........................: ${data.metrics.errors.values.rate.toFixed(2)}%\n`;
  summary += `${indent}  http_req_duration..............: avg=${data.metrics.http_req_duration.values.avg.toFixed(2)}ms p(95)=${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n`;
  summary += `${indent}  http_reqs......................: ${data.metrics.http_reqs.values.count} (${data.metrics.http_reqs.values.rate.toFixed(2)}/s)\n`;

  return summary;
}
