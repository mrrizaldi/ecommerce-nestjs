import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

/**
 * Helper function to register a new user and login
 * @returns Access token for authenticated requests
 */
export async function registerAndLogin(
  app: INestApplication,
  email: string,
  password: string,
  fullName: string = 'Test User',
): Promise<string> {
  // Register
  const registerRes = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password, fullName });

  if (registerRes.status !== 201) {
    throw new Error(`Registration failed: ${registerRes.status}`);
  }

  // Login
  const loginRes = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password });

  if (loginRes.status !== 200) {
    throw new Error(`Login failed: ${loginRes.status}`);
  }

  if (!loginRes.body.accessToken) {
    throw new Error('No access token received');
  }

  return loginRes.body.accessToken;
}

/**
 * Helper to create a test user with specific role
 */
export async function createUserWithRole(
  app: INestApplication,
  prisma: any,
  role: 'USER' | 'ADMIN',
): Promise<{ email: string; token: string; userId: string }> {
  const email = `${role.toLowerCase()}-${Date.now()}@test.local`;
  const password = 'TestPass123!';

  const token = await registerAndLogin(app, email, password, `${role} User`);

  // Update role if needed
  if (role === 'ADMIN') {
    await prisma.user.update({
      where: { email },
      data: { role: 'ADMIN' },
    });
  }

  const user = await prisma.user.findUnique({ where: { email } });

  return {
    email,
    token,
    userId: user.id,
  };
}

/**
 * Helper to generate unique email for tests
 */
export function generateTestEmail(prefix: string = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}@test.local`;
}

/**
 * Helper to create test product with variant
 */
export async function createTestProduct(
  prisma: any,
  options: {
    title?: string;
    price?: number;
    stock?: number;
    currency?: string;
  } = {},
): Promise<{ productId: string; variantId: string }> {
  const {
    title = 'Test Product',
    price = 100000,
    stock = 50,
    currency = 'IDR',
  } = options;

  const product = await prisma.product.create({
    data: {
      title,
      slug: `test-${Date.now()}`,
      status: 'ACTIVE',
      description: 'Test product description',
      variants: {
        create: [
          {
            sku: `TEST-SKU-${Date.now()}`,
            title: 'Default Variant',
            price,
            currency,
            inventoryStock: {
              create: {
                quantity: stock,
              },
            },
          },
        ],
      },
    },
    include: {
      variants: {
        include: {
          inventoryStock: true,
        },
      },
    },
  });

  return {
    productId: product.id,
    variantId: product.variants[0].id,
  };
}

/**
 * Helper to cleanup test data
 */
export async function cleanupTestData(
  prisma: any,
  data: {
    userEmails?: string[];
    productIds?: string[];
    orderIds?: string[];
    cartIds?: string[];
  },
): Promise<void> {
  const { userEmails = [], productIds = [], orderIds = [], cartIds = [] } = data;

  // Clean orders
  for (const orderId of orderIds) {
    await prisma.inventoryMovement.deleteMany({ where: { orderId } });
    await prisma.payment.deleteMany({ where: { orderId } });
    await prisma.shipment.deleteMany({ where: { orderId } });
    await prisma.orderItem.deleteMany({ where: { orderId } });
    await prisma.order.deleteMany({ where: { id: orderId } });
  }

  // Clean carts
  for (const cartId of cartIds) {
    await prisma.cartItem.deleteMany({ where: { cartId } });
    await prisma.cart.deleteMany({ where: { id: cartId } });
  }

  // Clean products
  for (const productId of productIds) {
    await prisma.inventoryStock.deleteMany({
      where: { variant: { productId } },
    });
    await prisma.productVariant.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
  }

  // Clean users
  if (userEmails.length > 0) {
    await prisma.user.deleteMany({
      where: { email: { in: userEmails } },
    });
  }
}

/**
 * Helper to wait for async operations
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Helper to make authenticated request
 */
export function authenticatedRequest(
  app: INestApplication,
  token: string,
  method: 'get' | 'post' | 'put' | 'delete',
  url: string,
) {
  return request(app.getHttpServer())
  [method](url)
    .set('Authorization', `Bearer ${token}`);
}
