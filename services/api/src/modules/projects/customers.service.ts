import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string, search?: string) {
    return this.prisma.customer.findMany({
      where: {
        tenantId,
        ...(search?.trim()
          ? {
              OR: [
                { name: { contains: search.trim(), mode: 'insensitive' } },
                { code: { contains: search.trim(), mode: 'insensitive' } },
                { industry: { contains: search.trim(), mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        _count: {
          select: { projects: true },
        },
      },
      orderBy: [{ name: 'asc' }],
    });
  }

  async findOne(tenantId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { tenantId, id: customerId },
      include: {
        projects: {
          select: {
            id: true,
            name: true,
            code: true,
            status: true,
            startDate: true,
            endDate: true,
            timezone: true,
            currencyCode: true,
          },
          orderBy: [{ createdAt: 'desc' }],
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer was not found for this tenant.');
    }

    return customer;
  }

  async create(currentUser: AuthenticatedUser, dto: CreateCustomerDto) {
    try {
      return await this.prisma.customer.create({
        data: {
          tenantId: currentUser.tenantId,
          name: dto.name.trim(),
          code: dto.code.trim().toUpperCase(),
          industry: dto.industry?.trim(),
          contactName: dto.contactName?.trim(),
          contactEmail: dto.contactEmail?.trim().toLowerCase(),
          contactPhone: dto.contactPhone?.trim(),
          billingEmail: dto.billingEmail?.trim().toLowerCase(),
          websiteUrl: dto.websiteUrl?.trim(),
          address: dto.address?.trim(),
          status: dto.status ?? 'ACTIVE',
          createdById: currentUser.userId,
          updatedById: currentUser.userId,
        },
      });
    } catch (error) {
      handleCustomerWriteError(error);
    }
  }

  async update(
    currentUser: AuthenticatedUser,
    customerId: string,
    dto: UpdateCustomerDto,
  ) {
    try {
      const updated = await this.prisma.customer.updateMany({
        where: { tenantId: currentUser.tenantId, id: customerId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.code !== undefined
            ? { code: dto.code.trim().toUpperCase() }
            : {}),
          ...(dto.industry !== undefined
            ? { industry: dto.industry?.trim() ?? null }
            : {}),
          ...(dto.contactName !== undefined
            ? { contactName: dto.contactName?.trim() ?? null }
            : {}),
          ...(dto.contactEmail !== undefined
            ? { contactEmail: dto.contactEmail?.trim().toLowerCase() ?? null }
            : {}),
          ...(dto.contactPhone !== undefined
            ? { contactPhone: dto.contactPhone?.trim() ?? null }
            : {}),
          ...(dto.billingEmail !== undefined
            ? { billingEmail: dto.billingEmail?.trim().toLowerCase() ?? null }
            : {}),
          ...(dto.websiteUrl !== undefined
            ? { websiteUrl: dto.websiteUrl?.trim() ?? null }
            : {}),
          ...(dto.address !== undefined
            ? { address: dto.address?.trim() ?? null }
            : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          updatedById: currentUser.userId,
        },
      });

      if (updated.count === 0) {
        throw new NotFoundException('Customer was not found for this tenant.');
      }

      return this.findOne(currentUser.tenantId, customerId);
    } catch (error) {
      handleCustomerWriteError(error);
    }
  }
}

function handleCustomerWriteError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    throw new ConflictException(
      'Customer code is already in use for this tenant.',
    );
  }

  throw error;
}
