import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('User Management (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up test data
    await prisma.user.deleteMany({
      where: {
        email: {
          contains: 'e2e-test',
        },
      },
    });
  });

  describe('Authentication Security', () => {
    it('should enforce rate limiting on login attempts', async () => {
      const loginData = {
        email: 'rate-limit-test@example.com',
        password: 'wrongpassword',
      };

      // Make multiple rapid requests
      const requests = [];
      for (let i = 0; i < 6; i++) {
        requests.push(
          request(app.getHttpServer())
            .post('/auth/login')
            .send(loginData)
            .expect(401)
        );
      }

      const responses = await Promise.allSettled(requests);
      
      // First few should be 401 (invalid credentials)
      // Later ones should be 429 (rate limited)
      const rateLimitedResponses = responses.filter(
        (result, index) => index >= 4 && result.status === 'fulfilled' && result.value.status === 429
      );

      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should enforce rate limiting on registration', async () => {
      const baseEmail = 'rate-limit-reg';
      
      const requests = [];
      for (let i = 0; i < 4; i++) {
        requests.push(
          request(app.getHttpServer())
            .post('/auth/register')
            .send({
              email: `${baseEmail}${i}@example.com`,
              password: 'TestPassword123!',
              fullName: 'Test User',
            })
        );
      }

      const responses = await Promise.allSettled(requests);
      
      // Should get 201 for first, then 429 for subsequent
      const successCount = responses.filter(
        (result) => result.status === 'fulfilled' && result.value.status === 201
      ).length;
      
      const rateLimitedCount = responses.filter(
        (result) => result.status === 'fulfilled' && result.value.status === 429
      ).length;

      expect(successCount).toBe(1);
      expect(rateLimitedCount).toBeGreaterThan(0);
    });

    it('should reject weak passwords', async () => {
      const weakPasswords = [
        '123456',
        'password',
        'qwerty',
        'admin123',
        'test',
        'weak',
      ];

      for (const password of weakPasswords) {
        const response = await request(app.getHttpServer())
          .post('/auth/register')
          .send({
            email: `weak-pwd-${Date.now()}@example.com`,
            password,
            fullName: 'Test User',
          })
          .expect(400);

        expect(response.body.message).toContain('Password does not meet security requirements');
      }
    });

    it('should accept strong passwords', async () => {
      const strongPasswords = [
        'Str0ngP@ssw0rd!',
        'MyS3cure#P@ssw0rd',
        'C0mpl3x@Adm1n123',
      ];

      for (const password of strongPasswords) {
        await request(app.getHttpServer())
          .post('/auth/register')
          .send({
            email: `strong-pwd-${Date.now()}@example.com`,
            password,
            fullName: 'Test User',
          })
          .expect(201);
      }
    });

    it('should prevent SQL injection attempts', async () => {
      const sqlInjectionPayloads = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "admin'--",
        "' UNION SELECT * FROM users --",
      ];

      for (const payload of sqlInjectionPayloads) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            email: payload,
            password: 'password',
          })
          .expect(401); // Should be rejected as invalid credentials
      }
    });
  });

  describe('User Management Performance', () => {
    it('should handle concurrent user creation', async () => {
      const concurrentRequests = 10;
      const requests = [];

      for (let i = 0; i < concurrentRequests; i++) {
        requests.push(
          request(app.getHttpServer())
            .post('/auth/register')
            .send({
              email: `concurrent-${i}-${Date.now()}@example.com`,
              password: 'Str0ngP@ssw0rd!',
              fullName: `Concurrent User ${i}`,
            })
        );
      }

      const responses = await Promise.allSettled(requests);
      const successCount = responses.filter(
        (result) => result.status === 'fulfilled' && result.value.status === 201
      ).length;

      expect(successCount).toBe(concurrentRequests);
    });

    it('should cache user data efficiently', async () => {
      // Create a user
      const email = `cache-test-${Date.now()}@example.com`;
      const createResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email,
          password: 'Str0ngP@ssw0rd!',
          fullName: 'Cache Test User',
        })
        .expect(201);

      const userId = createResponse.body.user.id;

      // First request should hit database
      const startTime1 = Date.now();
      await request(app.getHttpServer())
        .get(`/users/${userId}`)
        .set('Authorization', `Bearer ${createResponse.body.accessToken}`)
        .expect(200);
      const firstRequestTime = Date.now() - startTime1;

      // Second request should be faster (from cache)
      const startTime2 = Date.now();
      await request(app.getHttpServer())
        .get(`/users/${userId}`)
        .set('Authorization', `Bearer ${createResponse.body.accessToken}`)
        .expect(200);
      const secondRequestTime = Date.now() - startTime2;

      // Second request should be faster (cached)
      expect(secondRequestTime).toBeLessThan(firstRequestTime);
    });

    it('should handle large user lists efficiently', async () => {
      // Create multiple users
      const users = [];
      for (let i = 0; i < 50; i++) {
        const user = await request(app.getHttpServer())
          .post('/auth/register')
          .send({
            email: `list-test-${i}-${Date.now()}@example.com`,
            password: 'Str0ngP@ssw0rd!',
            fullName: `List Test User ${i}`,
          })
          .expect(201);
        
        users.push(user.body.user);
      }

      // Create admin user and get token
      const adminResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: `admin-${Date.now()}@example.com`,
          password: 'Str0ngP@ssw0rd!',
          fullName: 'Admin User',
        })
        .expect(201);

      const adminToken = adminResponse.body.accessToken;

      // Test user list performance
      const startTime = Date.now();
      const listResponse = await request(app.getHttpServer())
        .get('/users?page=1&limit=50')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const requestTime = Date.now() - startTime;

      expect(listResponse.body.data).toHaveLength(50);
      expect(requestTime).toBeLessThan(2000); // Should complete within 2 seconds
    });
  });

  describe('User Data Security', () => {
    it('should sanitize user data in responses', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: `sanitize-test-${Date.now()}@example.com`,
          password: 'Str0ngP@ssw0rd!',
          fullName: 'Sanitize Test User',
        })
        .expect(201);

      const user = response.body.user;
      
      // Should not contain password hash
      expect(user).not.toHaveProperty('passwordHash');
      
      // Should contain expected fields
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('email');
      expect(user).toHaveProperty('fullName');
      expect(user).toHaveProperty('role');
      expect(user).toHaveProperty('createdAt');
    });

    it('should handle email case insensitivity', async () => {
      const email = 'case.test@example.com';
      
      // Register with mixed case
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'CaSe.TeSt@ExAmPlE.CoM',
          password: 'Str0ngP@ssw0rd!',
          fullName: 'Case Test User',
        })
        .expect(201);

      // Should not be able to register again with different case
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'CASE.TEST@EXAMPLE.COM',
          password: 'AnotherStr0ngP@ss!',
          fullName: 'Case Test User 2',
        })
        .expect(400); // Email already exists
    });

    it('should validate input data properly', async () => {
      const invalidData = [
        { email: 'invalid-email', password: 'Valid123!' },
        { email: 'valid@example.com', password: '' },
        { email: '', password: 'Valid123!' },
        { email: 'valid@example.com', password: 'a' }, // Too short
      ];

      for (const data of invalidData) {
        await request(app.getHttpServer())
          .post('/auth/register')
          .send(data)
          .expect(400);
      }
    });
  });

  describe('Account Management', () => {
    it('should handle profile updates securely', async () => {
      const userResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: `profile-test-${Date.now()}@example.com`,
          password: 'Str0ngP@ssw0rd!',
          fullName: 'Profile Test User',
        })
        .expect(201);

      const token = userResponse.body.accessToken;
      const userId = userResponse.body.user.id;

      // Update profile
      const updateResponse = await request(app.getHttpServer())
        .put('/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({
          fullName: 'Updated Name',
          phone: '+1234567890',
        })
        .expect(200);

      expect(updateResponse.body.fullName).toBe('Updated Name');
      expect(updateResponse.body.phone).toBe('+1234567890');

      // Verify data is sanitized
      await request(app.getHttpServer())
        .get(`/users/${userId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).not.toHaveProperty('passwordHash');
        });
    });

    it('should handle account deactivation', async () => {
      const userResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: `deactivate-test-${Date.now()}@example.com`,
          password: 'Str0ngP@ssw0rd!',
          fullName: 'Deactivate Test User',
        })
        .expect(201);

      const token = userResponse.body.accessToken;

      // User should be able to login when active
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: `deactivate-test-${Date.now()}@example.com`,
          password: 'Str0ngP@ssw0rd!',
        })
        .expect(200);

      // TODO: Implement deactivation endpoint and test it
      // After deactivation, login should fail
      // await request(app.getHttpServer())
      //   .post('/auth/login')
      //   .send({
      //     email: `deactivate-test-${Date.now()}@example.com`,
      //     password: 'Str0ngP@ssw0rd!',
      //   })
      //   .expect(401);
    });
  });

  describe('Load Testing', () => {
    it('should handle 50+ concurrent authentication requests', async () => {
      const concurrentRequests = 50;
      const requests = [];

      for (let i = 0; i < concurrentRequests; i++) {
        requests.push(
          request(app.getHttpServer())
            .post('/auth/login')
            .send({
              email: `load-test-${i}@example.com`,
              password: 'LoadTest123!',
            })
        );
      }

      const startTime = Date.now();
      const responses = await Promise.allSettled(requests);
      const totalTime = Date.now() - startTime;

      // Most should fail (user doesn't exist), but should handle gracefully
      const handledGracefully = responses.filter(
        (result) => result.status === 'fulfilled'
      ).length;

      expect(handledGracefully).toBe(concurrentRequests);
      expect(totalTime).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });
});