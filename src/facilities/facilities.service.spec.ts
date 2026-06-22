import { ConfigService } from '@nestjs/config';
import { ObjectId } from 'mongodb';
import { AppException } from '../common/exceptions/app.exception';
import { FacilitiesService } from './facilities.service';
import { FacilitySerializer } from './facility.serializer';
import { HealthFacility, IHealthFacility } from './health-facility.model';

describe('FacilitiesService', () => {
  const service = new FacilitiesService(HealthFacility, {
    getOrThrow: jest.fn(),
  } as unknown as ConfigService);

  it('rejects coordinates outside the valid range with the feature code', async () => {
    await expect(
      service.findNearby({
        lat: 91,
        lng: 106.8456,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AppException>>({
        statusCode: 400,
        code: 'INVALID_COORDINATES',
      }),
    );
  });

  it('serializes database fields into the public camelCase contract', () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    const facility: IHealthFacility & { distance_km: number } = {
      _id: new ObjectId(),
      name: 'Puskesmas Test',
      facility_type: 'Puskesmas',
      address: 'Jl. Test No. 1',
      city: 'Jakarta',
      province: 'DKI Jakarta',
      phone_number: '(021) 123456',
      latitude: -6.2088,
      longitude: 106.8456,
      location: {
        type: 'Point',
        coordinates: [106.8456, -6.2088],
      },
      operating_hours: 'Senin-Jumat 08:00-16:00',
      source: 'test',
      is_tb_service_available: true,
      is_active: true,
      created_at: now,
      updated_at: now,
      distance_km: 1.25,
    };

    expect(FacilitySerializer.toNearby(facility)).toEqual({
      id: facility._id.toHexString(),
      name: 'Puskesmas Test',
      facilityType: 'Puskesmas',
      address: 'Jl. Test No. 1',
      city: 'Jakarta',
      province: 'DKI Jakarta',
      phoneNumber: '(021) 123456',
      latitude: -6.2088,
      longitude: 106.8456,
      isTbServiceAvailable: true,
      distanceKm: 1.25,
    });
  });
});
