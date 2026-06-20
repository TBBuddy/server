import { Module } from '@nestjs/common';
import { MongoloquentModule } from '@mongoloquent/nestjs';
import { User } from './user.model';
import { UsersController } from './users.controller';
import { UsersIndexService } from './users-index.service';
import { UsersService } from './users.service';

@Module({
  imports: [MongoloquentModule.forFeature([User])],
  controllers: [UsersController],
  providers: [UsersService, UsersIndexService],
  exports: [UsersService, MongoloquentModule],
})
export class UsersModule {}
