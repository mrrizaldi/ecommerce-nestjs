# Load Testing with k6

This directory contains load tests for the e-commerce API using k6.

## Prerequisites

- k6 installed globally (already done)
- API server running on `http://localhost:3000` (or set `BASE_URL` environment variable)

## Running the Load Test

### Basic Run
```bash
k6 run test/load/user-flow.k6.js
```

### With Custom Base URL
```bash
BASE_URL=http://localhost:3000 k6 run test/load/user-flow.k6.js
```

### With Output to File
```bash
k6 run test/load/user-flow.k6.js --out json=results.json
```

## Test Scenarios

The load test simulates a complete e-commerce user journey:

### 1. Authentication Flow
- User registration with unique email
- User login with JWT token generation
- Validates authentication endpoints

### 2. Product Browsing
- Lists all products
- Gets detailed product information
- Validates product data structure

### 3. Shopping Cart Management
- Retrieves user's cart
- Adds product variants to cart
- Validates cart operations with idempotency

### 4. Checkout Process
- Creates order from cart items
- Lists user orders
- Validates order creation and status

## Load Configuration

- **Duration**: 3 minutes 30 seconds total
- **Virtual Users**: Ramps up to 50 concurrent users
- **Stages**:
  - 30s: Ramp up to 10 users
  - 1m: Ramp up to 50 users
  - 2m: Stay at 50 users
  - 30s: Ramp down to 0 users

## Performance Thresholds

- 95% of requests should complete in < 500ms
- 99% of requests should complete in < 1000ms
- Error rate should be < 1%
- Custom error rate should be < 10%

## Metrics Collected

- **Custom Metrics**:
  - `registration_duration`: Time taken for user registration
  - `login_duration`: Time taken for user login
  - `checkout_duration`: Time taken for checkout process
  - `errors`: Custom error rate tracking

- **Standard k6 Metrics**:
  - HTTP request duration
  - HTTP request failure rate
  - Virtual user iterations
  - Request throughput

## Output

The test generates:
- Console output with real-time metrics
- `summary.json` file with detailed results
- Formatted text summary

## Notes

- Each virtual user creates a unique account
- Test uses realistic think times between operations
- Cart operations include idempotency keys
- Test validates complete user journey from registration to checkout
- Health check performed before starting load test

## Troubleshooting

1. **Connection refused**: Ensure API server is running
2. **High error rates**: Check database connectivity and API health
3. **Slow responses**: Monitor server resources and database performance
4. **Authentication failures**: Verify user registration/login endpoints