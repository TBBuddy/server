import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@mongoloquent/nestjs';
import {
  addDays,
  differenceInCalendarDays,
  isValid,
  parseISO,
  startOfDay,
} from 'date-fns';
import { Collection, Filter, ObjectId, Sort, WithId } from 'mongodb';
import { Database } from 'mongoloquent';
import { AppException } from '../common/exceptions/app.exception';
import { MedicineStocksIndexService } from '../medicine-stocks/medicine-stocks-index.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PatientsIndexService } from '../patients/patients-index.service';
import { CreateTravelPlanDto } from './dto/create-travel-plan.dto';
import { ListTravelPlansQueryDto } from './dto/list-travel-plans-query.dto';
import { TravelPlanDetailResponseDto } from './dto/travel-plan-response.dto';
import { UpdateTravelPlanDto } from './dto/update-travel-plan.dto';
import { TravelPlanStatus } from './enums/travel-plan-status.enum';
import { ITravelPlan, TravelPlan } from './models/travel-plan.model';
import { TravelPlanSerializer } from './serializers/travel-plan.serializer';

interface PaginatedTravelPlans {
  plans: TravelPlanDetailResponseDto[];
  total: number;
}

@Injectable()
export class TravelPlansService implements OnApplicationBootstrap {
  constructor(
    @InjectModel(TravelPlan)
    private readonly travelPlanModel: typeof TravelPlan,
    private readonly patientsIndex: PatientsIndexService,
    private readonly medicineStocksIndex: MedicineStocksIndexService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.travelPlanModel
      .query()
      .getMongoDBCollection()
      .createIndexes([
        {
          key: { patient_id: 1, patient_profile_id: 1, departure_date: 1 },
          name: 'travel_plans_patient_profile_departure',
        },
        {
          key: { patient_profile_id: 1, cancelled_at: 1 },
          name: 'travel_plans_profile_cancelled',
        },
      ]);
  }

  async create(userId: string, dto: CreateTravelPlanDto): Promise<void> {
    const profile = await this.patientsIndex.getPatientProfile(userId);
    const dates = this.parseAndValidateDates(
      dto.departureDate,
      dto.returnDate,
      { rejectPastDeparture: true },
    );
    const now = new Date();

    const plan = await this.travelPlanModel.create({
      patient_id: userId,
      patient_profile_id: profile._id.toHexString(),
      destination: dto.destination,
      departure_date: dates.departureDate,
      return_date: dates.returnDate,
      cancelled_at: null,
      created_at: now,
      updated_at: now,
    });

    await this.notificationsService.scheduleTravelReminders({
      id: plan._id.toHexString(),
      patient_id: userId,
      patient_profile_id: profile._id.toHexString(),
      destination: dto.destination,
      departure_date: dates.departureDate,
    });
  }

  async findAll(
    userId: string,
    query: ListTravelPlansQueryDto,
  ): Promise<PaginatedTravelPlans> {
    const profile = await this.patientsIndex.getPatientProfile(userId);
    const patientProfileId = profile._id.toHexString();
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Filter<ITravelPlan> = {
      patient_id: userId,
      patient_profile_id: patientProfileId,
    };
    const sort = this.buildListSort(query);

    const [plans, total] = await Promise.all([
      this.collection()
        .find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      this.collection().countDocuments(filter),
    ]);

    return {
      plans: await Promise.all(
        plans.map((plan) => this.serialize(plan, patientProfileId)),
      ),
      total,
    };
  }

  async findOne(
    userId: string,
    planId: string,
  ): Promise<TravelPlanDetailResponseDto> {
    const [plan, activeProfile] = await Promise.all([
      this.requireOwnedPlan(userId, planId),
      this.patientsIndex.getPatientProfile(userId),
    ]);

    return this.serialize(plan, activeProfile._id.toHexString());
  }

  async update(
    userId: string,
    planId: string,
    dto: UpdateTravelPlanDto,
  ): Promise<void> {
    if (
      dto.destination === undefined &&
      dto.departureDate === undefined &&
      dto.returnDate === undefined
    ) {
      throw new AppException(
        400,
        'BUSINESS_RULE_VIOLATION',
        'Minimal satu field rencana perjalanan harus dikirim.',
      );
    }

    const [plan, activeProfile] = await Promise.all([
      this.requireOwnedPlan(userId, planId),
      this.patientsIndex.getPatientProfile(userId),
    ]);
    const activeProfileId = activeProfile._id.toHexString();
    this.assertEditable(plan, activeProfileId);

    const effectiveDeparture = dto.departureDate
      ? this.parseDateOnly(dto.departureDate, 'departureDate')
      : startOfDay(plan.departure_date);
    const effectiveReturn = dto.returnDate
      ? this.parseDateOnly(dto.returnDate, 'returnDate')
      : startOfDay(plan.return_date);

    if (dto.departureDate !== undefined) {
      this.assertDepartureNotPast(effectiveDeparture);
    }
    this.assertReturnNotBeforeDeparture(effectiveDeparture, effectiveReturn);

    const changes: Partial<ITravelPlan> = { updated_at: new Date() };
    if (dto.destination !== undefined) changes.destination = dto.destination;
    if (dto.departureDate !== undefined)
      changes.departure_date = effectiveDeparture;
    if (dto.returnDate !== undefined) changes.return_date = effectiveReturn;

    await this.collection().updateOne(
      {
        _id: plan._id,
        patient_id: userId,
        patient_profile_id: activeProfileId,
        cancelled_at: null,
      },
      { $set: changes },
    );

    if (dto.departureDate !== undefined || dto.destination !== undefined) {
      const updatedPlan = { ...plan, ...changes };
      await this.notificationsService.cancelTravelReminder(plan._id.toHexString());
      await this.notificationsService.scheduleTravelReminders({
        id: plan._id.toHexString(),
        patient_id: userId,
        patient_profile_id: activeProfileId,
        destination: updatedPlan.destination,
        departure_date: updatedPlan.departure_date,
      });
    }
  }

  async cancel(userId: string, planId: string): Promise<void> {
    const [plan, activeProfile] = await Promise.all([
      this.requireOwnedPlan(userId, planId),
      this.patientsIndex.getPatientProfile(userId),
    ]);
    const activeProfileId = activeProfile._id.toHexString();
    this.assertEditable(plan, activeProfileId);

    await this.collection().updateOne(
      {
        _id: plan._id,
        patient_id: userId,
        patient_profile_id: activeProfileId,
        cancelled_at: null,
      },
      {
        $set: {
          cancelled_at: new Date(),
          updated_at: new Date(),
        },
      },
    );

    await this.notificationsService.cancelTravelReminder(plan._id.toHexString());
  }

  private async serialize(
    plan: WithId<ITravelPlan>,
    activeProfileId: string,
  ): Promise<TravelPlanDetailResponseDto> {
    const durationDays = this.durationDays(
      plan.departure_date,
      plan.return_date,
    );
    const status = this.resolveStatus(plan);
    const stockReadiness =
      await this.medicineStocksIndex.calculateTravelRequirementForProfile(
        plan.patient_id,
        plan.patient_profile_id,
        durationDays,
      );
    const isEditable =
      plan.patient_profile_id === activeProfileId &&
      status !== TravelPlanStatus.CANCELLED &&
      status !== TravelPlanStatus.COMPLETED;

    return TravelPlanSerializer.toResponse(
      plan,
      status,
      isEditable,
      durationDays,
      stockReadiness,
    );
  }

  private async requireOwnedPlan(
    userId: string,
    planId: string,
  ): Promise<WithId<ITravelPlan>> {
    if (!ObjectId.isValid(planId)) {
      throw new AppException(
        400,
        'INVALID_ID',
        'ID rencana perjalanan tidak valid.',
      );
    }

    const plan = await this.collection().findOne({
      _id: new ObjectId(planId),
      patient_id: userId,
    });

    if (!plan) {
      throw new AppException(
        404,
        'RESOURCE_NOT_FOUND',
        'Rencana perjalanan tidak ditemukan.',
      );
    }

    return plan;
  }

  private assertEditable(plan: WithId<ITravelPlan>, activeProfileId: string) {
    const status = this.resolveStatus(plan);
    if (
      plan.patient_profile_id !== activeProfileId ||
      status === TravelPlanStatus.CANCELLED ||
      status === TravelPlanStatus.COMPLETED
    ) {
      throw new AppException(
        409,
        'TRAVEL_PLAN_NOT_EDITABLE',
        'Rencana perjalanan tidak dapat diubah.',
      );
    }
  }

  private parseAndValidateDates(
    departureDateValue: string,
    returnDateValue: string,
    options: { rejectPastDeparture: boolean },
  ): { departureDate: Date; returnDate: Date } {
    const departureDate = this.parseDateOnly(
      departureDateValue,
      'departureDate',
    );
    const returnDate = this.parseDateOnly(returnDateValue, 'returnDate');

    if (options.rejectPastDeparture) {
      this.assertDepartureNotPast(departureDate);
    }
    this.assertReturnNotBeforeDeparture(departureDate, returnDate);

    return { departureDate, returnDate };
  }

  private parseDateOnly(value: string, field: string): Date {
    const parsed = startOfDay(parseISO(value));
    if (!isValid(parsed)) {
      throw new AppException(400, 'VALIDATION_ERROR', `${field} tidak valid.`, [
        {
          field,
          code: 'IS_DATE',
          message: `${field} harus berupa tanggal valid.`,
        },
      ]);
    }
    return parsed;
  }

  private assertDepartureNotPast(departureDate: Date): void {
    if (departureDate < startOfDay(new Date())) {
      throw new AppException(
        400,
        'BUSINESS_RULE_VIOLATION',
        'Tanggal keberangkatan tidak boleh di masa lalu.',
      );
    }
  }

  private assertReturnNotBeforeDeparture(
    departureDate: Date,
    returnDate: Date,
  ): void {
    if (returnDate < departureDate) {
      throw new AppException(
        400,
        'BUSINESS_RULE_VIOLATION',
        'Tanggal kembali tidak boleh sebelum tanggal keberangkatan.',
      );
    }
  }

  private resolveStatus(plan: ITravelPlan): TravelPlanStatus {
    if (plan.cancelled_at) {
      return TravelPlanStatus.CANCELLED;
    }

    const today = startOfDay(new Date());
    const departure = startOfDay(plan.departure_date);
    const afterReturn = addDays(startOfDay(plan.return_date), 1);

    if (today >= afterReturn) {
      return TravelPlanStatus.COMPLETED;
    }
    if (today >= departure) {
      return TravelPlanStatus.ONGOING;
    }
    return TravelPlanStatus.PLANNED;
  }

  private durationDays(departureDate: Date, returnDate: Date): number {
    return (
      differenceInCalendarDays(
        startOfDay(returnDate),
        startOfDay(departureDate),
      ) + 1
    );
  }

  private buildListSort(query: ListTravelPlansQueryDto): Sort {
    const fieldMap = {
      departureDate: 'departure_date',
      returnDate: 'return_date',
      createdAt: 'created_at',
    } as const;
    const field = fieldMap[query.sortBy ?? 'departureDate'];
    const direction = query.sortOrder === 'desc' ? -1 : 1;

    return {
      [field]: direction,
      _id: 1,
    };
  }

  private collection(): Collection<ITravelPlan> {
    return Database.getDb(
      this.configService.getOrThrow<string>('MONGODB_CONNECTION'),
      this.configService.getOrThrow<string>('MONGODB_DATABASE'),
    ).collection<ITravelPlan>('travel_plans');
  }
}
