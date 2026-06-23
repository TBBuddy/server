import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MessageResponseDto } from '../common/dto/message-response.dto';
import { UserRole } from '../common/enums/user-role.enum';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { CreateTravelPlanDto } from './dto/create-travel-plan.dto';
import { ListTravelPlansQueryDto } from './dto/list-travel-plans-query.dto';
import {
  PaginatedTravelPlanResponseDto,
  TravelPlanDataResponseDto,
} from './dto/travel-plan-response.dto';
import { TravelPlanIdParamDto } from './dto/travel-plan-id-param.dto';
import { UpdateTravelPlanDto } from './dto/update-travel-plan.dto';
import { TravelPlansService } from './travel-plans.service';

@ApiTags('travel-plans')
@ApiBearerAuth()
@Roles(UserRole.PATIENT)
@Controller('travel-plans')
export class TravelPlansController {
  constructor(private readonly service: TravelPlansService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Buat rencana perjalanan pasien' })
  @ApiCreatedResponse({ type: MessageResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTravelPlanDto,
  ): Promise<MessageResponseDto> {
    await this.service.create(user.id, dto);
    return { message: 'Rencana perjalanan berhasil dibuat.' };
  }

  @Get()
  @ApiOperation({ summary: 'Daftar rencana perjalanan episode aktif pasien' })
  @ApiOkResponse({ type: PaginatedTravelPlanResponseDto })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListTravelPlansQueryDto,
  ): Promise<PaginatedTravelPlanResponseDto> {
    const { plans, total } = await this.service.findAll(user.id, query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    return {
      data: plans,
      meta: {
        page,
        limit,
        totalItems: total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail rencana perjalanan pasien' })
  @ApiOkResponse({ type: TravelPlanDataResponseDto })
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: TravelPlanIdParamDto,
  ): Promise<TravelPlanDataResponseDto> {
    const data = await this.service.findOne(user.id, params.id);
    return { data };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Perbarui rencana perjalanan pasien' })
  @ApiOkResponse({ type: MessageResponseDto })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: TravelPlanIdParamDto,
    @Body() dto: UpdateTravelPlanDto,
  ): Promise<MessageResponseDto> {
    await this.service.update(user.id, params.id, dto);
    return { message: 'Rencana perjalanan berhasil diperbarui.' };
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Batalkan rencana perjalanan pasien' })
  @ApiOkResponse({ type: MessageResponseDto })
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: TravelPlanIdParamDto,
  ): Promise<MessageResponseDto> {
    await this.service.cancel(user.id, params.id);
    return { message: 'Rencana perjalanan berhasil dibatalkan.' };
  }
}
