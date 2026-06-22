import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
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
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../common/enums/user-role.enum';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { MessageResponseDto } from '../common/dto/message-response.dto';
import { MedicineStocksService } from './medicine-stocks.service';
import { MedicineStockSerializer } from './serializers/medicine-stock.serializer';
import { CreateMedicineStockDto } from './dto/create-medicine-stock.dto';
import { UpdateMedicineStockDto } from './dto/update-medicine-stock.dto';
import { RestockMedicineDto } from './dto/restock-medicine.dto';
import { AdjustMedicineDto } from './dto/adjust-medicine.dto';
import { ListMedicineStocksQueryDto } from './dto/list-medicine-stocks-query.dto';
import { ListStockLogsQueryDto } from './dto/list-stock-logs-query.dto';
import { MedicineStockIdParamDto } from './dto/medicine-stock-id-param.dto';
import {
  MedicineStockDataResponseDto,
  PaginatedMedicineStockLogResponseDto,
  PaginatedMedicineStockResponseDto,
} from './dto/medicine-stock-response.dto';

@ApiTags('medicine-stocks')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.PATIENT)
@Controller('medicine-stocks')
export class MedicineStocksController {
  constructor(private readonly service: MedicineStocksService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Tambahkan stok obat pasien' })
  @ApiCreatedResponse({ type: MessageResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMedicineStockDto,
  ): Promise<MessageResponseDto> {
    await this.service.create(user.id, dto);
    return { message: 'Stok obat berhasil ditambahkan.' };
  }

  @Get()
  @ApiOperation({ summary: 'Daftar stok obat pasien' })
  @ApiOkResponse({ type: PaginatedMedicineStockResponseDto })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListMedicineStocksQueryDto,
  ): Promise<PaginatedMedicineStockResponseDto> {
    const { stocks, total } = await this.service.findAll(user.id, query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    return {
      data: stocks.map((stock) => MedicineStockSerializer.toResponse(stock)),
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
  @ApiOperation({ summary: 'Detail stok obat pasien' })
  @ApiOkResponse({ type: MedicineStockDataResponseDto })
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: MedicineStockIdParamDto,
  ): Promise<MedicineStockDataResponseDto> {
    const stock = await this.service.findOne(user.id, params.id);
    return { data: MedicineStockSerializer.toResponse(stock) };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Perbarui metadata stok obat' })
  @ApiOkResponse({ type: MessageResponseDto })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: MedicineStockIdParamDto,
    @Body() dto: UpdateMedicineStockDto,
  ): Promise<MessageResponseDto> {
    await this.service.update(user.id, params.id, dto);
    return { message: 'Data stok obat berhasil diperbarui.' };
  }

  @Post(':id/restock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Catat penambahan stok obat' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: MessageResponseDto })
  async restock(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: MedicineStockIdParamDto,
    @Body() dto: RestockMedicineDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ): Promise<MessageResponseDto> {
    await this.service.restock(user.id, params.id, dto, idempotencyKey);
    return { message: 'Restock obat berhasil dicatat.' };
  }

  @Post(':id/adjust')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Catat penyesuaian manual stok obat' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: MessageResponseDto })
  async adjust(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: MedicineStockIdParamDto,
    @Body() dto: AdjustMedicineDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ): Promise<MessageResponseDto> {
    await this.service.adjust(user.id, params.id, dto, idempotencyKey);
    return { message: 'Penyesuaian stok berhasil dicatat.' };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Nonaktifkan stok obat' })
  @ApiOkResponse({ type: MessageResponseDto })
  async deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: MedicineStockIdParamDto,
  ): Promise<MessageResponseDto> {
    await this.service.deactivate(user.id, params.id);
    return { message: 'Stok obat berhasil dinonaktifkan.' };
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'Riwayat perubahan stok obat' })
  @ApiOkResponse({ type: PaginatedMedicineStockLogResponseDto })
  async findLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: MedicineStockIdParamDto,
    @Query() query: ListStockLogsQueryDto,
  ): Promise<PaginatedMedicineStockLogResponseDto> {
    const { logs, total } = await this.service.findLogs(
      user.id,
      params.id,
      query,
    );
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    return {
      data: logs.map((log) => MedicineStockSerializer.toLogResponse(log)),
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
}
