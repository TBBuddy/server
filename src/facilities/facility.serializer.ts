import {
  HealthFacilityDetailResponseDto,
  HealthFacilitySummaryResponseDto,
  NearbyHealthFacilityResponseDto,
} from './dto/facility-response.dto';
import { IHealthFacility } from './health-facility.model';

type FacilityDocument = IHealthFacility & {
  distance_km?: number;
};

export class FacilitySerializer {
  static toSummary(
    facility: FacilityDocument,
  ): HealthFacilitySummaryResponseDto {
    return {
      id: facility._id.toHexString(),
      name: facility.name,
      facilityType: facility.facility_type,
      address: facility.address,
      city: facility.city,
      province: facility.province,
      phoneNumber: facility.phone_number,
      latitude: facility.latitude,
      longitude: facility.longitude,
      isTbServiceAvailable: facility.is_tb_service_available,
    };
  }

  static toDetail(facility: FacilityDocument): HealthFacilityDetailResponseDto {
    return {
      ...this.toSummary(facility),
      operatingHours: facility.operating_hours,
      source: facility.source,
      createdAt: facility.created_at,
      updatedAt: facility.updated_at,
    };
  }

  static toNearby(facility: FacilityDocument): NearbyHealthFacilityResponseDto {
    return {
      ...this.toSummary(facility),
      distanceKm: facility.distance_km ?? 0,
    };
  }
}
