import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
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
import { MedicineStocksService } from './medicine-stocks.service';
import { MedicineStockSerializer } from './serializers/medicine-stock.serializer';
import { CreateMedicineStockDto } from './dto/create-medicine-stock.dto';
import { UpdateMedicineStockDto } from './dto/update-medicine-stock.dto';
import { RestockMedicineDto } from './dto/restock-medicine.dto';
import { AdjustMedicineDto } from './dto/adjust-medicine.dto';
import { ListMedicineStocksQueryDto } from './dto/list-medicine-stocks-query.dto';
import { ListStockLogsQueryDto } from './dto/list-stock-logs-query.dto';

@ApiTags('medicine-stocks')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.PATIENT)
@Controller('medicine-stocks')
export class MedicineStocksController {
  constructor(private readonly service: MedicineStocksService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMedicineStockDto,
  ): Promise<MessageResponseDto> {
    await this.service.create(user.id, dto);
    return { message: 'Stok obat berhasil ditambahkan.' };
  }

  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListMedicineStocksQueryDto,
  ) {
    const { stocks, total } = await this.service.findAll(user.id, query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    return {
      data: stocks.map(MedicineStockSerializer.toResponse),
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
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') stockId: string,
  ) {
    const stock = await this.service.findOne(user.id, stockId);
    return { data: MedicineStockSerializer.toResponse(stock) };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') stockId: string,
    @Body() dto: UpdateMedicineStockDto,
  ): Promise<MessageResponseDto> {
    await this.service.update(user.id, stockId, dto);
    return { message: 'Data stok obat berhasil diperbarui.' };
  }

  @Post(':id/restock')
  @HttpCode(HttpStatus.OK)
  async restock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') stockId: string,
    @Body() dto: RestockMedicineDto,
  ): Promise<MessageResponseDto> {
    await this.service.restock(user.id, stockId, dto);
    return { message: 'Restock obat berhasil dicatat.' };
  }

  @Post(':id/adjust')
  @HttpCode(HttpStatus.OK)
  async adjust(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') stockId: string,
    @Body() dto: AdjustMedicineDto,
  ): Promise<MessageResponseDto> {
    await this.service.adjust(user.id, stockId, dto);
    return { message: 'Penyesuaian stok berhasil dicatat.' };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') stockId: string,
  ): Promise<MessageResponseDto> {
    await this.service.deactivate(user.id, stockId);
    return { message: 'Stok obat berhasil dinonaktifkan.' };
  }

  @Get(':id/logs')
  async findLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') stockId: string,
    @Query() query: ListStockLogsQueryDto,
  ) {
    const { logs, total } = await this.service.findLogs(user.id, stockId, query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    return {
      data: logs.map(MedicineStockSerializer.toLogResponse),
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