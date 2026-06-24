import { TravelStockRequirementSummaryDto } from '../../medicine-stocks/dto/medicine-stock-response.dto';
import { TravelPlanStatus } from '../enums/travel-plan-status.enum';
import { ITravelPlan } from '../models/travel-plan.model';
import { TravelPlanDetailResponseDto } from '../dto/travel-plan-response.dto';

export class TravelPlanSerializer {
  static toResponse(
    plan: ITravelPlan,
    status: TravelPlanStatus,
    isEditable: boolean,
    durationDays: number,
    stockReadiness: TravelStockRequirementSummaryDto,
  ): TravelPlanDetailResponseDto {
    return {
      id: plan._id.toString(),
      patientId: plan.patient_id,
      patientProfileId: plan.patient_profile_id,
      destination: plan.destination,
      departureDate: plan.departure_date.toISOString().split('T')[0],
      returnDate: plan.return_date.toISOString().split('T')[0],
      durationDays,
      status,
      isEditable,
      stockReadiness,
      cancelledAt: plan.cancelled_at ? plan.cancelled_at.toISOString() : null,
      createdAt: plan.created_at!.toISOString(),
      updatedAt: plan.updated_at!.toISOString(),
    };
  }
}
