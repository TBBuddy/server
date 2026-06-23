import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { SymptomListDataResponseDto } from './dto/symptom-response.dto';
import { CheckinsService } from './checkins.service';

@ApiTags('symptoms')
@ApiBearerAuth()
@Roles(UserRole.PATIENT)
@Controller('symptoms')
export class SymptomsController {
  constructor(private readonly checkinsService: CheckinsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Daftar master gejala' })
  @ApiOkResponse({ type: SymptomListDataResponseDto })
  async getSymptoms(): Promise<SymptomListDataResponseDto> {
    const data = await this.checkinsService.getSymptoms();
    return { data };
  }
}
