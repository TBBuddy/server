import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Database } from 'mongoloquent';
import { IHealthFacility } from './health-facility.model';

@Injectable()
export class FacilitiesIndexService implements OnApplicationBootstrap {
  constructor(private readonly configService: ConfigService) {}

  async onApplicationBootstrap(): Promise<void> {
    const database = Database.getDb(
      this.configService.getOrThrow<string>('MONGODB_CONNECTION'),
      this.configService.getOrThrow<string>('MONGODB_DATABASE'),
    );

    const facilities =
      database.collection<IHealthFacility>('health_facilities');
    await facilities.createIndexes([
      {
        key: { location: '2dsphere' },
        name: 'health_facilities_location_2dsphere',
      },
      { key: { city: 1 }, name: 'health_facilities_city' },
      { key: { facility_type: 1 }, name: 'health_facilities_facility_type' },
      { key: { is_active: 1 }, name: 'health_facilities_is_active' },
      {
        key: { is_tb_service_available: 1 },
        name: 'health_facilities_tb_service',
      },
      {
        key: { name: 1, city: 1, address: 1 },
        name: 'health_facilities_seed_identity',
        unique: true,
      },
    ]);
  }
}
