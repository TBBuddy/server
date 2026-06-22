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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { CheckinsService } from './checkins.service';
import { CreateCheckinDto } from './dto/create-checkin.dto';
import { UpdateCheckinDto } from './dto/update-checkin.dto';
import { GetCheckinsDto } from './dto/get-checkins.dto';
import { CheckinResponseDto } from './dto/checkin-response.dto';

@ApiTags('checkins')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.PATIENT)
@Controller('checkins')
export class CheckinsController {
  constructor(private readonly checkinsService: CheckinsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: [CheckinResponseDto] })
  async getCheckins(
    @CurrentUser() user: AuthenticatedUser,
    @Query() dto: GetCheckinsDto,
  ): Promise<{ data: CheckinResponseDto[] }> {
    const data = await this.checkinsService.getCheckins(user.id, dto);
    return { data };
  }

  @Get('today')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CheckinResponseDto })
  async getTodayCheckin(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: CheckinResponseDto | null }> {
    const data = await this.checkinsService.getTodayCheckin(user.id);
    return { data };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CheckinResponseDto })
  async getCheckinById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ data: CheckinResponseDto }> {
    const data = await this.checkinsService.getCheckinById(user.id, id);
    return { data };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: CheckinResponseDto })
  async createCheckin(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCheckinDto,
  ): Promise<{ data: CheckinResponseDto }> {
    const data = await this.checkinsService.createCheckin(user.id, dto);
    return { data };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CheckinResponseDto })
  async updateCheckin(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCheckinDto,
  ): Promise<{ data: CheckinResponseDto }> {
    const data = await this.checkinsService.updateCheckin(user.id, id, dto);
    return { data };
  }
}
