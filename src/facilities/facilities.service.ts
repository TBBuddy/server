import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@mongoloquent/nestjs';
import { Collection, Filter, ObjectId, Sort } from 'mongodb';
import { Database } from 'mongoloquent';
import { AppException } from '../common/exceptions/app.exception';
import {
  HealthFacilityDetailResponseDto,
  HealthFacilitySummaryResponseDto,
  NearbyHealthFacilityResponseDto,
  PaginationMetaDto,
} from './dto/facility-response.dto';
import { GetFacilitiesDto } from './dto/get-facilities.dto';
import { GetNearbyFacilitiesDto } from './dto/get-nearby-facilities.dto';
import { FacilitySerializer } from './facility.serializer';
import { HealthFacility, IHealthFacility } from './health-facility.model';
import { healthFacilitiesSeed } from './seed/health-facilities.seed';

export interface PaginatedFacilities {
  data: HealthFacilitySummaryResponseDto[];
  meta: PaginationMetaDto;
}

@Injectable()
export class FacilitiesService {
  constructor(
    @InjectModel(HealthFacility)
    private readonly facilityModel: typeof HealthFacility,
    private readonly configService: ConfigService,
  ) {}

  async findAll(dto: GetFacilitiesDto): Promise<PaginatedFacilities> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const filter = this.buildListFilter(dto);
    const sort = this.buildListSort(dto);
    const collection = this.nativeCollection();
    const [facilities, totalItems] = await Promise.all([
      collection
        .find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      collection.countDocuments(filter),
    ]);
    const totalPages = Math.ceil(totalItems / limit);

    return {
      data: facilities.map((facility) =>
        FacilitySerializer.toSummary(facility),
      ),
      meta: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async findNearby(
    dto: GetNearbyFacilitiesDto,
  ): Promise<NearbyHealthFacilityResponseDto[]> {
    const { lat, lng } = this.validateCoordinates(dto.lat, dto.lng);
    const radius = dto.radius ?? 5000;
    const limit = dto.limit ?? 20;
    const query: Filter<IHealthFacility> = { is_active: true };

    if (dto.isTbServiceAvailable !== undefined) {
      query.is_tb_service_available = dto.isTbServiceAvailable;
    }

    const facilities = await this.nativeCollection()
      .aggregate<IHealthFacility & { distance_km: number }>([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [lng, lat] },
            distanceField: 'distance_meters',
            maxDistance: radius,
            spherical: true,
            query,
          },
        },
        {
          $addFields: {
            distance_km: {
              $round: [{ $divide: ['$distance_meters', 1000] }, 2],
            },
          },
        },
        { $sort: { distance_meters: 1 } },
        { $limit: limit },
        { $unset: 'distance_meters' },
      ])
      .toArray();

    return facilities.map((facility) => FacilitySerializer.toNearby(facility));
  }

  async findById(id: string): Promise<HealthFacilityDetailResponseDto> {
    if (!ObjectId.isValid(id)) {
      throw this.notFound();
    }

    const facility = await this.facilityModel
      .where('_id', new ObjectId(id))
      .where('is_active', true)
      .first();

    if (!facility) {
      throw this.notFound();
    }

    return FacilitySerializer.toDetail(facility);
  }

  async seedFacilities(): Promise<{
    insertedCount: number;
    existingCount: number;
  }> {
    const now = new Date();
    const result = await this.nativeCollection().bulkWrite(
      healthFacilitiesSeed.map((facility) => ({
        updateOne: {
          filter: {
            name: facility.name,
            city: facility.city,
            address: facility.address,
          },
          update: {
            $setOnInsert: {
              ...facility,
              location: {
                type: 'Point' as const,
                coordinates: facility.location.coordinates as [number, number],
              },
              created_at: now,
              updated_at: now,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );

    return {
      insertedCount: result.upsertedCount,
      existingCount: healthFacilitiesSeed.length - result.upsertedCount,
    };
  }

  private buildListFilter(dto: GetFacilitiesDto): Filter<IHealthFacility> {
    const filter: Filter<IHealthFacility> = { is_active: true };

    if (dto.city) {
      filter.city = { $regex: this.escapeRegex(dto.city), $options: 'i' };
    }
    if (dto.facilityType) {
      filter.facility_type = dto.facilityType;
    }
    if (dto.isTbServiceAvailable !== undefined) {
      filter.is_tb_service_available = dto.isTbServiceAvailable;
    }
    if (dto.search) {
      const regex = {
        $regex: this.escapeRegex(dto.search),
        $options: 'i',
      };
      filter.$or = [
        { name: regex },
        { address: regex },
        { city: regex },
        { province: regex },
      ];
    }

    return filter;
  }

  private buildListSort(dto: GetFacilitiesDto): Sort {
    const fields = {
      name: 'name',
      city: 'city',
      facilityType: 'facility_type',
      createdAt: 'created_at',
    } as const;
    const field = fields[dto.sortBy ?? 'name'];
    const direction = dto.sortOrder === 'desc' ? -1 : 1;

    return {
      is_tb_service_available: -1,
      [field]: direction,
      _id: 1,
    };
  }

  private validateCoordinates(
    latitude: number,
    longitude: number,
  ): { lat: number; lng: number } {
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new AppException(
        400,
        'INVALID_COORDINATES',
        'Koordinat latitude atau longitude tidak valid.',
      );
    }

    return { lat: latitude, lng: longitude };
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private notFound(): AppException {
    return new AppException(
      404,
      'RESOURCE_NOT_FOUND',
      'Fasilitas kesehatan tidak ditemukan.',
    );
  }

  private nativeCollection(): Collection<IHealthFacility> {
    return Database.getDb(
      this.configService.getOrThrow<string>('MONGODB_CONNECTION'),
      this.configService.getOrThrow<string>('MONGODB_DATABASE'),
    ).collection<IHealthFacility>('health_facilities');
  }
}
