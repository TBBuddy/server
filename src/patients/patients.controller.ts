import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../common/enums/user-role.enum';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { MessageResponseDto } from '../common/dto/message-response.dto';
import { PatientsService } from './patients.service';
import { OnboardingDto } from './dto/onboarding.dto';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';
import { CreatePmoDto } from './dto/create-pmo.dto';
import { UpdatePmoDto } from './dto/update-pmo.dto';
import { ClosePatientProfileDto } from './dto/close-patient-profile.dto';
import {
  PatientProfileDataResponseDto,
  PatientDashboardDataResponseDto,
  PatientHistoryDataResponseDto,
} from './dto/patient-response.dto';

@ApiTags('patients')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard)
@Controller('patients/me')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Post('onboarding')
  @Roles(UserRole.PATIENT, UserRole.SUPPORTER)
  async onboarding(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: OnboardingDto,
  ): Promise<MessageResponseDto> {
    await this.patientsService.createOnboarding(user.id, dto);
    return { message: 'Onboarding berhasil diselesaikan.' };
  }

  @Post('profile/close')
  @Roles(UserRole.PATIENT)
  async closeProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ClosePatientProfileDto,
  ): Promise<MessageResponseDto> {
    await this.patientsService.closeActiveProfile(user.id, dto);
    return { message: 'Episode pengobatan berhasil ditutup.' };
  }

  @Get('history')
  @Roles(UserRole.PATIENT, UserRole.SUPPORTER)
  async getHistory(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PatientHistoryDataResponseDto> {
    return { data: await this.patientsService.getHistory(user.id) };
  }

  @Get('history/:id')
  @Roles(UserRole.PATIENT, UserRole.SUPPORTER)
  async getHistoryById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') profileId: string,
  ): Promise<PatientProfileDataResponseDto> {
    return {
      data: await this.patientsService.getHistoryById(user.id, profileId),
    };
  }

  @Get('profile')
  @Roles(UserRole.PATIENT)
  async getProfile(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PatientProfileDataResponseDto> {
    const data = await this.patientsService.getOwnProfile(user.id);
    return { data };
  }

  @Patch('profile')
  @Roles(UserRole.PATIENT)
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePatientProfileDto,
  ): Promise<MessageResponseDto> {
    await this.patientsService.updateOwnProfile(user.id, dto);
    return { message: 'Profil pengobatan berhasil diperbarui.' };
  }

  @Get('dashboard')
  @Roles(UserRole.PATIENT)
  async getDashboard(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PatientDashboardDataResponseDto> {
    const data = await this.patientsService.getDashboard(user.id);
    return { data };
  }

  @Get('pmos')
  @Roles(UserRole.PATIENT)
  async listPmos(@CurrentUser() user: AuthenticatedUser) {
    const data = await this.patientsService.listPmos(user.id);
    return { data };
  }

  @Post('pmos')
  @Roles(UserRole.PATIENT)
  async createPmo(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePmoDto,
  ): Promise<MessageResponseDto> {
    await this.patientsService.createPmo(user.id, dto);
    return { message: 'PMO berhasil ditambahkan.' };
  }

  @Patch('pmos/:id')
  @Roles(UserRole.PATIENT)
  async updatePmo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') pmoId: string,
    @Body() dto: UpdatePmoDto,
  ): Promise<MessageResponseDto> {
    await this.patientsService.updatePmo(user.id, pmoId, dto);
    return { message: 'PMO berhasil diperbarui.' };
  }

  @Delete('pmos/:id')
  @Roles(UserRole.PATIENT)
  async deactivatePmo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') pmoId: string,
  ): Promise<MessageResponseDto> {
    await this.patientsService.deactivatePmo(user.id, pmoId);
    return { message: 'PMO berhasil dinonaktifkan.' };
  }
}
