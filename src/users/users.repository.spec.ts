import { UsersRepository } from './users.repository';
import { PrismaService } from '../prisma/prisma.service';

const createPrismaMock = () => ({
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
});

describe('UsersRepository', () => {
  const prisma = createPrismaMock();
  const repository = new UsersRepository(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('findById includes default relations', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });

    await repository.findById('user-1');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      include: {
        addresses: {
          where: { isDefault: true },
          take: 1,
        },
      },
    });
  });

  it('create forwards arguments to prisma', async () => {
    prisma.user.create.mockResolvedValue({ id: 'user-1' });
    const payload = { data: { email: 'test@example.com' } };

    await repository.create(payload as any);

    expect(prisma.user.create).toHaveBeenCalledWith(payload);
  });

  it('findAll returns paginated response', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'user-1' }]);
    prisma.user.count.mockResolvedValue(1);

    const result = await repository.findAll(1, 10);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: expect.any(Object),
      }),
    );
    expect(result.meta.total).toBe(1);
    expect(result.data).toHaveLength(1);
  });
});

