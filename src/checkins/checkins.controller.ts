import {
  Body,
  Controller,
  Get,
  Headers,
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
  // ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { MessageResponseDto } from '../common/dto/message-response.dto';
import { UserRole } from '../common/enums/user-role.enum';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { CheckinsService } from './checkins.service';
import { CheckinIdParamDto } from './dto/checkin-id-param.dto';
import {
  DailyCheckinDataResponseDto,
  PaginatedCheckinResponseDto,
} from './dto/checkin-response.dto';
import { CreateCheckinDto } from './dto/create-checkin.dto';
import { GetCheckinsDto } from './dto/get-checkins.dto';
import { UpdateCheckinDto } from './dto/update-checkin.dto';

@ApiTags('checkins')
@ApiBearerAuth()
@Roles(UserRole.PATIENT)
@Controller('checkins')
export class CheckinsController {
  constructor(private readonly service: CheckinsService) {}

  @Get()
  @ApiOperation({ summary: 'Riwayat check-in pasien' })
  @ApiOkResponse({ type: PaginatedCheckinResponseDto })
  getCheckins(
    @CurrentUser() user: AuthenticatedUser,
    @Query() dto: GetCheckinsDto,
  ): Promise<PaginatedCheckinResponseDto> {
    return this.service.getCheckins(user.id, dto);
  }

  @Get('today')
  @ApiOperation({ summary: 'Check-in pasien hari ini' })
  @ApiOkResponse({ type: DailyCheckinDataResponseDto })
  async getToday(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DailyCheckinDataResponseDto> {
    return { data: await this.service.getTodayCheckin(user.id) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail check-in pasien' })
  @ApiOkResponse({ type: DailyCheckinDataResponseDto })
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: CheckinIdParamDto,
  ): Promise<DailyCheckinDataResponseDto> {
    return { data: await this.service.getCheckinById(user.id, params.id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Simpan check-in hari ini' })
  // @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: MessageResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCheckinDto,
    // @Headers('idempotency-key') idempotencyKey: string,
  ): Promise<MessageResponseDto> {
    await this.service.createCheckin(user.id, dto);
    return { message: 'Check-in hari ini berhasil disimpan.' };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Koreksi check-in hari ini' })
  @ApiOkResponse({ type: MessageResponseDto })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: CheckinIdParamDto,
    @Body() dto: UpdateCheckinDto,
  ): Promise<MessageResponseDto> {
    await this.service.updateCheckin(user.id, params.id, dto);
    return { message: 'Check-in berhasil diperbarui.' };
  }
}
