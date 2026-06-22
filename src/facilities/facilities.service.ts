import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@mongoloquent/nestjs';
import { ObjectId } from 'mongodb';
import { Database } from 'mongoloquent';
import { AppException } from '../common/exceptions/app.exception';
import { GetFacilitiesDto } from './dto/get-facilities.dto';
import { GetNearbyFacilitiesDto } from './dto/get-nearby-facilities.dto';
import { HealthFacility, IHealthFacility } from './health-facility.model';
import { healthFacilitiesSeed } from './seed/health-facilities.seed';

export interface NearbyFacility extends IHealthFacility {
  distance_km: number;
}

@Injectable()
export class FacilitiesService {
  constructor(
    @InjectModel(HealthFacility)
    private readonly facilityModel: typeof HealthFacility,
    private readonly configService: ConfigService,
  ) {}

  async findAll(dto: GetFacilitiesDto): Promise<IHealthFacility[]> {
    let query = this.facilityModel.where('is_active', true);

    if (dto.city) {
      const facilities = await this.nativeCollection()
        .find({
          is_active: true,
          city: { $regex: dto.city, $options: 'i' },
          ...(dto.facility_type && { facility_type: dto.facility_type }),
          ...(dto.is_tb_service_available !== undefined && {
            is_tb_service_available: dto.is_tb_service_available,
          }),
        })
        .toArray();
      return facilities as unknown as IHealthFacility[];
    }

    if (dto.facility_type) {
      query = query.where('facility_type', dto.facility_type);
    }
    if (dto.is_tb_service_available !== undefined) {
      query = query.where(
        'is_tb_service_available',
        dto.is_tb_service_available,
      );
    }

    return query.get();
  }

  async findNearby(dto: GetNearbyFacilitiesDto): Promise<NearbyFacility[]> {
    const radius = dto.radius ?? 5000;

    const results = await this.nativeCollection()
      .aggregate([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [dto.lng, dto.lat] },
            distanceField: 'distance_meters',
            maxDistance: radius,
            spherical: true,
            query: { is_active: true },
          },
        },
        {
          $addFields: {
            distance_km: {
              $round: [{ $divide: ['$distance_meters', 1000] }, 2],
            },
          },
        },
        { $unset: 'distance_meters' },
      ])
      .toArray();

    return results as unknown as NearbyFacility[];
  }

  async findById(id: string): Promise<IHealthFacility> {
    if (!ObjectId.isValid(id)) {
      throw new AppException(
        404,
        'RESOURCE_NOT_FOUND',
        'Fasilitas kesehatan tidak ditemukan.',
      );
    }

    const facility = await this.facilityModel
      .where('_id', new ObjectId(id))
      .where('is_active', true)
      .first();

    if (!facility) {
      throw new AppException(
        404,
        'RESOURCE_NOT_FOUND',
        'Fasilitas kesehatan tidak ditemukan.',
      );
    }

    return facility;
  }

  async seedFacilities(): Promise<string> {
    const count = await this.facilityModel.where('is_active', true).count();
    if (count > 0) {
      return `skipped — ${count} fasilitas sudah tersedia`;
    }

    await this.nativeCollection().insertMany(
      healthFacilitiesSeed.map((f) => ({
        ...f,
        created_at: new Date(),
        updated_at: new Date(),
      })) as any[],
    );

    return `inserted ${healthFacilitiesSeed.length} fasilitas`;
  }

  private nativeCollection() {
    return Database.getDb(
      this.configService.getOrThrow<string>('MONGODB_CONNECTION'),
      this.configService.getOrThrow<string>('MONGODB_DATABASE'),
    ).collection<IHealthFacility>('health_facilities');
  }
}
