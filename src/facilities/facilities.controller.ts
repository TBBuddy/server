import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { DataResponse } from '../common/dto/data-response.dto';
import {
  FacilityResponseDto,
  NearbyFacilityResponseDto,
} from './dto/facility-response.dto';
import { GetFacilitiesDto } from './dto/get-facilities.dto';
import { GetNearbyFacilitiesDto } from './dto/get-nearby-facilities.dto';
import { FacilitiesService } from './facilities.service';
import { IHealthFacility } from './health-facility.model';

@ApiTags('Facilities')
@ApiBearerAuth()
@Controller('facilities')
export class FacilitiesController {
  constructor(private readonly facilitiesService: FacilitiesService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: FacilityResponseDto, isArray: true })
  async findAll(
    @Query() dto: GetFacilitiesDto,
  ): Promise<DataResponse<IHealthFacility[]>> {
    const data = await this.facilitiesService.findAll(dto);
    return { data };
  }

  @Get('nearby')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: NearbyFacilityResponseDto, isArray: true })
  async findNearby(@Query() dto: GetNearbyFacilitiesDto) {
    const data = await this.facilitiesService.findNearby(dto);
    return { data };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: FacilityResponseDto })
  async findById(
    @Param('id') id: string,
  ): Promise<DataResponse<IHealthFacility>> {
    const data = await this.facilitiesService.findById(id);
    return { data };
  }
}
