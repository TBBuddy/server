import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  HealthFacilityDetailDataResponseDto,
  NearbyHealthFacilityDataResponseDto,
  PaginatedHealthFacilityResponseDto,
} from './dto/facility-response.dto';
import { GetFacilitiesDto } from './dto/get-facilities.dto';
import { GetNearbyFacilitiesDto } from './dto/get-nearby-facilities.dto';
import { FacilitiesService } from './facilities.service';

@ApiTags('Facilities')
@ApiBearerAuth()
@Controller('facilities')
export class FacilitiesController {
  constructor(private readonly facilitiesService: FacilitiesService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: PaginatedHealthFacilityResponseDto })
  findAll(
    @Query() dto: GetFacilitiesDto,
  ): Promise<PaginatedHealthFacilityResponseDto> {
    return this.facilitiesService.findAll(dto);
  }

  @Get('nearby')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: NearbyHealthFacilityDataResponseDto })
  async findNearby(
    @Query() dto: GetNearbyFacilitiesDto,
  ): Promise<NearbyHealthFacilityDataResponseDto> {
    const data = await this.facilitiesService.findNearby(dto);
    return { data };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: HealthFacilityDetailDataResponseDto })
  async findById(
    @Param('id') id: string,
  ): Promise<HealthFacilityDetailDataResponseDto> {
    const data = await this.facilitiesService.findById(id);
    return { data };
  }
}
