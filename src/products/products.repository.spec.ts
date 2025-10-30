import { ProductsRepository } from './products.repository';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsSortOption } from './dto/get-products-query.dto';

const createPrismaMock = () => ({
  product: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
});

describe('ProductsRepository', () => {
  const prisma = createPrismaMock();
  const repository = new ProductsRepository(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('findAll builds where clause and sorting from filters', async () => {
    prisma.product.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);

    await repository.findAll({
      page: 2,
      limit: 10,
      search: 'keyboard',
      status: 'ACTIVE',
      categoryIds: ['cat-1'],
      minPrice: 10000,
      maxPrice: 20000,
      sort: ProductsSortOption.PRICE_ASC,
    });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        orderBy: { variants: { _min: { price: 'asc' } } },
        where: expect.objectContaining({ AND: expect.any(Array) }),
      }),
    );
  });

  it('create forwards to prisma with include', async () => {
    prisma.product.create.mockResolvedValue({ id: 'prod-1' });

    await repository.create({ title: 'Keyboard' } as any);

    expect(prisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { title: 'Keyboard' } }),
    );
  });

  it('update passes through id and data', async () => {
    prisma.product.update.mockResolvedValue({ id: 'prod-1' });

    await repository.update('prod-1', { title: 'Updated' });

    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prod-1' },
        data: { title: 'Updated' },
      }),
    );
  });
});

