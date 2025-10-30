/**
 * Seed script untuk 50,000 users dengan data realistis
 * Menggunakan batch insert untuk performa optimal
 */
import { PrismaClient, Role } from '@prisma/client';
import { faker } from '@faker-js/faker';

const prisma = new PrismaClient();

// Konfigurasi jumlah data
const CONFIG = {
  TOTAL_USERS: 50000,
  BATCH_SIZE: 1000, // Insert per batch untuk efisiensi

  // Ratio untuk data terkait (dari 50k users)
  CATEGORIES: 50, // 50 kategori produk
  PRODUCTS: 3000, // 3000 produk
  VARIANTS_PER_PRODUCT: 3, // rata-rata 3 varian per produk

  // Ratio user activity (%)
  USERS_WITH_ADDRESS: 0.7, // 70% user punya alamat
  USERS_WITH_CART: 0.3, // 30% user punya cart aktif
  USERS_WITH_ORDER: 0.5, // 50% user pernah order
  ORDERS_PER_USER: 2, // rata-rata 2 order per user yang pernah order
  ITEMS_PER_ORDER: 3, // rata-rata 3 item per order
};

// Types
interface UserData {
  email: string;
  passwordHash: string;
  fullName: string;
  phone: string | null;
  isActive: boolean;
  role: Role;
}

interface CategoryData {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

interface ProductData {
  id: string;
  title: string;
  slug: string;
  description: string;
  brand: string;
  status: string;
}

interface VariantData {
  id: string;
  productId: string;
  sku: string;
  title: string | null;
  price: number;
  currency: string;
  weightGrams: number;
}

interface AddressData {
  userId: string;
  label: string;
  recipient: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  province: string;
  postalCode: string;
  countryCode: string;
  isDefault: boolean;
}

interface CartData {
  id: string;
  userId: string;
  isCheckedOut: boolean;
  currency: string;
}

interface CartItemData {
  cartId: string;
  variantId: string;
  quantity: number;
}

interface OrderData {
  id: string;
  code: string;
  userId: string;
  status: string;
  currency: string;
  subtotalAmount: number;
  shippingAmount: number;
  discountAmount: number;
  totalAmount: number;
  placedAt: Date;
}

interface OrderItemData {
  orderId: string;
  variantId: string;
  sku: string;
  productTitle: string;
  variantTitle: string | null;
  price: number;
  quantity: number;
  total: number;
}

// Helper untuk generate batch data
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Helper untuk generate phone number
function generatePhoneNumber(): string {
  const numbers = faker.string.numeric(10);
  return `+62${numbers}`;
}

// Generate users data
function generateUsers(count: number): UserData[] {
  const users: UserData[] = [];
  for (let i = 0; i < count; i++) {
    users.push({
      email: `user${i + 1}@example.com`,
      passwordHash: '$2a$10$YourHashedPasswordHere', // Gunakan bcrypt hash yang sama untuk semua
      fullName: faker.person.fullName(),
      phone: faker.helpers.maybe(() => generatePhoneNumber(), { probability: 0.8 }) ?? null,
      isActive: faker.helpers.maybe(() => false, { probability: 0.05 }) ?? true, // 5% inactive
      role: i < 10 ? Role.ADMIN : Role.USER, // 10 admin pertama
    });
  }
  return users;
}

// Generate categories (hierarchical)
function generateCategories(): CategoryData[] {
  const categories: CategoryData[] = [];
  const mainCategories = [
    'Electronics', 'Fashion', 'Home & Living', 'Sports', 'Books',
    'Beauty', 'Toys', 'Automotive', 'Food & Beverage', 'Health'
  ];

  mainCategories.forEach((name) => {
    const id = faker.string.uuid();
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    categories.push({ id, name, slug, parentId: null });

    // Sub-categories
    for (let i = 0; i < 4; i++) {
      const subId = faker.string.uuid();
      const subName = `${name} - ${faker.commerce.department()}`;
      const subSlug = `${slug}-${i + 1}`;
      categories.push({
        id: subId,
        name: subName,
        slug: subSlug,
        parentId: id
      });
    }
  });

  return categories;
}

// Generate products
function generateProducts(count: number): ProductData[] {
  const products: ProductData[] = [];
  for (let i = 0; i < count; i++) {
    const title = faker.commerce.productName();
    products.push({
      id: faker.string.uuid(),
      title,
      slug: `${faker.helpers.slugify(title).toLowerCase()}-${i}`,
      description: faker.commerce.productDescription(),
      brand: faker.company.name(),
      status: faker.helpers.maybe(() => 'INACTIVE', { probability: 0.1 }) ?? 'ACTIVE',
    });
  }
  return products;
}

// Generate product variants
function generateVariants(products: ProductData[]): VariantData[] {
  const variants: VariantData[] = [];
  products.forEach((product) => {
    const variantCount = faker.number.int({ min: 1, max: 5 });
    for (let i = 0; i < variantCount; i++) {
      variants.push({
        id: faker.string.uuid(),
        productId: product.id,
        sku: `SKU-${product.id.substring(0, 4)}-${i}-${Date.now()}`,
        title: faker.helpers.maybe(() => faker.commerce.productAdjective(), { probability: 0.7 }) ?? null,
        price: parseFloat(faker.commerce.price({ min: 10000, max: 5000000 })),
        currency: 'IDR',
        weightGrams: faker.number.int({ min: 100, max: 5000 }),
      });
    }
  });
  return variants;
}

async function main() {
  console.log('🚀 Mulai seeding database...\n');
  const startTime = Date.now();

  try {
    // 1. SEED CATEGORIES
    console.log('📦 Seeding categories...');
    const categories = generateCategories();
    const mainCats = categories.filter(c => !c.parentId);
    const subCats = categories.filter(c => c.parentId);

    await prisma.category.createMany({ data: mainCats, skipDuplicates: true });
    await prisma.category.createMany({ data: subCats, skipDuplicates: true });
    console.log(`✅ ${categories.length} categories seeded\n`);

    // 2. SEED PRODUCTS
    console.log('🛍️  Seeding products...');
    const categoryRecords = await prisma.category.findMany();
    const categoryIds = categoryRecords.map(c => c.id);

    const products = generateProducts(CONFIG.PRODUCTS);
    const productBatches = chunkArray(products, CONFIG.BATCH_SIZE);

    for (let i = 0; i < productBatches.length; i++) {
      await prisma.product.createMany({ data: productBatches[i], skipDuplicates: true });
      console.log(`  Progress: ${((i + 1) / productBatches.length * 100).toFixed(1)}%`);
    }
    console.log(`✅ ${products.length} products seeded\n`);

    // 3. SEED PRODUCT CATEGORIES (M2M)
    console.log('🔗 Linking products to categories...');
    const productCategories = products.map(p => ({
      productId: p.id,
      categoryId: faker.helpers.arrayElement(categoryIds)
    }));
    await prisma.productCategory.createMany({ data: productCategories, skipDuplicates: true });
    console.log(`✅ Product-category links created\n`);

    // 4. SEED PRODUCT VARIANTS
    console.log('📊 Seeding product variants...');
    const variants = generateVariants(products);
    const variantBatches = chunkArray(variants, CONFIG.BATCH_SIZE);

    for (let i = 0; i < variantBatches.length; i++) {
      await prisma.productVariant.createMany({ data: variantBatches[i], skipDuplicates: true });
      console.log(`  Progress: ${((i + 1) / variantBatches.length * 100).toFixed(1)}%`);
    }
    console.log(`✅ ${variants.length} variants seeded\n`);

    // Ambil ID varian yang benar-benar ada di database untuk relasi
    const actualVariantRecords = await prisma.productVariant.findMany({ select: { id: true } });
    const actualVariantIds = actualVariantRecords.map(v => v.id);

    // 5. SEED INVENTORY STOCK
    console.log('📦 Seeding inventory stock...');
    const inventoryStock = actualVariantIds.map(variantId => ({
      variantId: variantId,
      quantity: faker.number.int({ min: 0, max: 1000 })
    }));
    const stockBatches = chunkArray(inventoryStock, CONFIG.BATCH_SIZE);

    for (let i = 0; i < stockBatches.length; i++) {
      await prisma.inventoryStock.createMany({ data: stockBatches[i], skipDuplicates: true });
    }
    console.log(`✅ Inventory stock seeded\n`);

    // 6. SEED USERS (50K)
    console.log('👥 Seeding 50,000 users...');
    const users = generateUsers(CONFIG.TOTAL_USERS);
    const userBatches = chunkArray(users, CONFIG.BATCH_SIZE);

    for (let i = 0; i < userBatches.length; i++) {
      await prisma.user.createMany({ data: userBatches[i], skipDuplicates: true });
      console.log(`  Progress: ${((i + 1) / userBatches.length * 100).toFixed(1)}%`);
    }
    console.log(`✅ ${CONFIG.TOTAL_USERS} users seeded\n`);

    // Ambil user IDs untuk relasi
    const userRecords = await prisma.user.findMany({ select: { id: true } });
    const userIds = userRecords.map(u => u.id);

    // 7. SEED ADDRESSES (70% users)
    console.log('📍 Seeding addresses...');
    const addressCount = Math.floor(CONFIG.TOTAL_USERS * CONFIG.USERS_WITH_ADDRESS);
    const addresses: AddressData[] = [];

    for (let i = 0; i < addressCount; i++) {
      const userId = userIds[i];
      // 1-2 alamat per user
      const numAddresses = faker.number.int({ min: 1, max: 2 });

      for (let j = 0; j < numAddresses; j++) {
        addresses.push({
          userId,
          label: j === 0 ? 'Rumah' : 'Kantor',
          recipient: faker.person.fullName(),
          phone: generatePhoneNumber(),
          line1: faker.location.streetAddress(),
          line2: faker.helpers.maybe(() => faker.location.secondaryAddress(), { probability: 0.3 }) ?? null,
          city: faker.location.city(),
          province: faker.location.state(),
          postalCode: faker.location.zipCode('#####'),
          countryCode: 'ID',
          isDefault: j === 0,
        });
      }
    }

    const addressBatches = chunkArray(addresses, CONFIG.BATCH_SIZE);
    for (let i = 0; i < addressBatches.length; i++) {
      await prisma.address.createMany({ data: addressBatches[i] });
      console.log(`  Progress: ${((i + 1) / addressBatches.length * 100).toFixed(1)}%`);
    }
    console.log(`✅ ${addresses.length} addresses seeded\n`);

    // 8. SEED CARTS (30% users have active cart)
    console.log('🛒 Seeding carts...');
    const cartCount = Math.floor(CONFIG.TOTAL_USERS * CONFIG.USERS_WITH_CART);
    const carts: CartData[] = [];

    for (let i = 0; i < cartCount; i++) {
      carts.push({
        id: faker.string.uuid(),
        userId: userIds[i],
        isCheckedOut: false,
        currency: 'IDR',
      });
    }

    await prisma.cart.createMany({ data: carts });

    // Cart items
    const cartItems: CartItemData[] = [];
    const variantRecords = await prisma.productVariant.findMany({ select: { id: true } });
    const variantIds = variantRecords.map(v => v.id);

    carts.forEach(cart => {
      const itemCount = faker.number.int({ min: 1, max: 5 });
      const selectedVariants = faker.helpers.arrayElements(variantIds, itemCount);

      selectedVariants.forEach(variantId => {
        cartItems.push({
          cartId: cart.id,
          variantId,
          quantity: faker.number.int({ min: 1, max: 3 })
        });
      });
    });

    await prisma.cartItem.createMany({ data: cartItems, skipDuplicates: true });
    console.log(`✅ ${carts.length} carts with ${cartItems.length} items seeded\n`);

    // 9. SEED ORDERS (50% users have orders)
    console.log('📦 Seeding orders...');
    const usersWithOrders = Math.floor(CONFIG.TOTAL_USERS * CONFIG.USERS_WITH_ORDER);
    const orders: OrderData[] = [];
    const orderItems: OrderItemData[] = [];

    let orderCounter = 0;
    for (let i = 0; i < usersWithOrders; i++) {
      const userId = userIds[i];
      const numOrders = faker.number.int({ min: 1, max: CONFIG.ORDERS_PER_USER });

      for (let j = 0; j < numOrders; j++) {
        const orderId = faker.string.uuid();
        const subtotal = faker.number.float({ min: 50000, max: 5000000, fractionDigits: 2 });
        const shipping = faker.number.float({ min: 10000, max: 50000, fractionDigits: 2 });
        const discount = faker.number.float({ min: 0, max: subtotal * 0.2, fractionDigits: 2 });

        orders.push({
          id: orderId,
          code: `ORD-${String(orderCounter).padStart(8, '0')}`,
          userId,
          status: faker.helpers.arrayElement(['PENDING_PAYMENT', 'PAID', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED']),
          currency: 'IDR',
          subtotalAmount: subtotal,
          shippingAmount: shipping,
          discountAmount: discount,
          totalAmount: subtotal + shipping - discount,
          placedAt: faker.date.past({ years: 1 }),
        });

        // Order items
        const itemCount = faker.number.int({ min: 1, max: CONFIG.ITEMS_PER_ORDER });
        const selectedVariants = faker.helpers.arrayElements(variantIds, itemCount);

        selectedVariants.forEach(variantId => {
          const price = faker.number.float({ min: 10000, max: 500000, fractionDigits: 2 });
          const qty = faker.number.int({ min: 1, max: 3 });

          orderItems.push({
            orderId,
            variantId,
            sku: `SKU-${faker.string.alphanumeric(10)}`,
            productTitle: faker.commerce.productName(),
            variantTitle: faker.helpers.maybe(() => faker.commerce.productAdjective(), { probability: 0.5 }) ?? null,
            price,
            quantity: qty,
            total: price * qty,
          });
        });

        orderCounter++;
      }
    }

    const orderBatches = chunkArray(orders, CONFIG.BATCH_SIZE);
    for (let i = 0; i < orderBatches.length; i++) {
      await prisma.order.createMany({ data: orderBatches[i] });
      console.log(`  Progress: ${((i + 1) / orderBatches.length * 100).toFixed(1)}%`);
    }

    const orderItemBatches = chunkArray(orderItems, CONFIG.BATCH_SIZE);
    for (let i = 0; i < orderItemBatches.length; i++) {
      await prisma.orderItem.createMany({ data: orderItemBatches[i] });
    }
    console.log(`✅ ${orders.length} orders with ${orderItems.length} items seeded\n`);

    // 10. SEED PAYMENTS
    console.log('💳 Seeding payments...');
    const payments = orders
      .filter(o => ['PAID', 'PROCESSING', 'SHIPPED', 'COMPLETED'].includes(o.status))
      .map((order, idx) => ({
        orderId: order.id,
        provider: faker.helpers.arrayElement(['MIDTRANS', 'XENDIT', 'GOPAY', 'OVO']),
        status: 'COMPLETED',
        amount: order.totalAmount,
        currency: 'IDR',
        transactionId: `TXN-${Date.now()}-${idx}`,
        idempotencyKey: `IDEM-${Date.now()}-${idx}`,
      }));

    const paymentBatches = chunkArray(payments, CONFIG.BATCH_SIZE);
    for (let i = 0; i < paymentBatches.length; i++) {
      await prisma.payment.createMany({ data: paymentBatches[i], skipDuplicates: true });
    }
    console.log(`✅ ${payments.length} payments seeded\n`);

    // Summary
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log('\n✨ SEEDING COMPLETED! ✨\n');
    console.log('Summary:');
    console.log(`├─ Users: ${CONFIG.TOTAL_USERS.toLocaleString()}`);
    console.log(`├─ Categories: ${categories.length}`);
    console.log(`├─ Products: ${products.length.toLocaleString()}`);
    console.log(`├─ Variants: ${variants.length.toLocaleString()}`);
    console.log(`├─ Addresses: ${addresses.length.toLocaleString()}`);
    console.log(`├─ Carts: ${carts.length.toLocaleString()}`);
    console.log(`├─ Orders: ${orders.length.toLocaleString()}`);
    console.log(`├─ Order Items: ${orderItems.length.toLocaleString()}`);
    console.log(`└─ Payments: ${payments.length.toLocaleString()}`);
    console.log(`\n⏱️  Duration: ${duration}s`);

  } catch (error) {
    console.error('❌ Error during seeding:', error);
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
