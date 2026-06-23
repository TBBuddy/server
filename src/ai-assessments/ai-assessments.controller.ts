import { Controller, Post, Get, Param, HttpCode } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { AiAssessmentsService } from './ai-assessments.service';
import type {
  AiAssessmentResponseDto,
  AiAssessmentDetailResponseDto,
} from './dto/ai-assessment-response.dto';

@ApiTags('AI Assessments')
@ApiBearerAuth()
@Roles(UserRole.PATIENT)
@Controller('ai-assessments')
export class AiAssessmentsController {
  constructor(private readonly service: AiAssessmentsService) {}

  @Post('generate')
  @HttpCode(202)
  @ApiOperation({ summary: 'Request AI assessment generation (async)' })
  async generate(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ job_id: string }> {
    return this.service.generate(user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all AI assessments for current patient' })
  async getAssessments(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AiAssessmentResponseDto[]> {
    return this.service.getAssessments(user.id);
  }

  @Get('latest')
  @ApiOperation({ summary: 'Get latest AI assessment' })
  async getLatest(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AiAssessmentResponseDto | null> {
    return this.service.getLatest(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get AI assessment detail with daily timeline' })
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<AiAssessmentDetailResponseDto> {
    return this.service.getById(user.id, id);
  }
}
